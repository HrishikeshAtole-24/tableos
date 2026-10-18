import type { Prisma, Tx } from '@tableos/db';
import {
  type ItemInput,
  type Locale,
  type MenuCategoryDto,
  type MenuItemDto,
  type MenuTag,
  type PublicMenuDto,
  type UpdateItemInput,
  rooms,
} from '@tableos/schemas';
import type { z } from 'zod';
import type { bulkPriceInput, reorderInput, translationInput } from '@tableos/schemas';
import type { Deps } from '../../context';
import { conflict, notFound } from '../../lib/errors';
import { isOpenAt, nextOpenLabel, todayHoursLabel } from '../../lib/time';
import { withTx } from '../../lib/tx';
import { JOBS } from '../../jobs/queue';
import { canOrder } from '../wallet/wallet.service';

const itemInclude = {
  variants: { orderBy: { sortOrder: 'asc' } },
  addonGroups: { orderBy: { sortOrder: 'asc' }, include: { addons: { orderBy: { sortOrder: 'asc' } } } },
} satisfies Prisma.MenuItemInclude;

type ItemRow = Prisma.MenuItemGetPayload<{ include: typeof itemInclude }>;

export function toItemDto(i: ItemRow): MenuItemDto {
  return {
    id: i.id,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    diet: i.diet,
    jainAvailable: i.jainAvailable,
    spiceLevel: i.spiceLevel,
    tags: i.tags as MenuTag[],
    basePricePaise: i.basePricePaise,
    taxRateBp: i.taxRateBp,
    photoUrl: i.photoUrl,
    available: i.available,
    visible: i.visible,
    sortOrder: i.sortOrder,
    variants: i.variants.map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise })),
    addonGroups: i.addonGroups.map((g) => ({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      addons: g.addons.map((a) => ({ id: a.id, name: a.name, pricePaise: a.pricePaise, available: a.available })),
    })),
  };
}

function roundPrice(paise: number, mode: 'none' | 'rupee' | 'five'): number {
  if (mode === 'none') return paise;
  const step = mode === 'rupee' ? 100 : 500;
  return Math.max(step, Math.round(paise / step) * step);
}

/** Small in-process cache for the public menu; invalidated by tag on every change. */
class MenuCache {
  private readonly map = new Map<string, { at: number; value: PublicMenuDto }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string): PublicMenuDto | null {
    const hit = this.map.get(key);
    if (!hit || Date.now() - hit.at > this.ttlMs) return null;
    return hit.value;
  }
  set(key: string, value: PublicMenuDto) {
    this.map.set(key, { at: Date.now(), value });
  }
  invalidate(restaurantId: string) {
    for (const k of this.map.keys()) if (k.startsWith(`${restaurantId}:`)) this.map.delete(k);
  }
}

export class MenuService {
  private readonly cache = new MenuCache(60_000);

  constructor(private readonly deps: Deps) {}

  /** Called after every menu write: drop caches, tell the web app to revalidate, refresh translations. */
  private async changed(restaurantId: string, opts: { translate?: boolean } = {}) {
    this.cache.invalidate(restaurantId);
    const r = await this.deps.db.restaurant.findUnique({ where: { id: restaurantId }, select: { slug: true } });
    if (r && this.deps.env.REVALIDATE_SECRET) {
      fetch(`${this.deps.env.WEB_URL}/api/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': this.deps.env.REVALIDATE_SECRET },
        body: JSON.stringify({ tag: `menu:${r.slug}` }),
        signal: AbortSignal.timeout(5_000),
      }).catch((err) => this.deps.log.warn({ err }, 'menu revalidate failed'));
    }
    if (opts.translate) await this.deps.jobs.send(JOBS.menuTranslate, { restaurantId }, { singletonKey: `translate:${restaurantId}` });
  }

  // ───── Read (dashboard) ─────

  async fullMenu(restaurantId: string): Promise<MenuCategoryDto[]> {
    const cats = await this.deps.db.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: itemInclude } },
    });
    return cats.map((c) => ({ id: c.id, name: c.name, visible: c.visible, sortOrder: c.sortOrder, items: c.items.map(toItemDto) }));
  }

  // ───── Categories ─────

  async createCategory(restaurantId: string, input: { name: string; visible: boolean }) {
    const max = await this.deps.db.menuCategory.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
    const c = await this.deps.db.menuCategory.create({ data: { restaurantId, name: input.name, visible: input.visible, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    await this.changed(restaurantId, { translate: true });
    return { id: c.id, name: c.name, visible: c.visible, sortOrder: c.sortOrder, items: [] };
  }

  async updateCategory(restaurantId: string, id: string, input: { name?: string; visible?: boolean }) {
    const r = await this.deps.db.menuCategory.updateMany({ where: { id, restaurantId }, data: input });
    if (r.count === 0) throw notFound('Category');
    await this.changed(restaurantId, { translate: input.name !== undefined });
  }

  async deleteCategory(restaurantId: string, id: string) {
    const count = await this.deps.db.menuItem.count({ where: { categoryId: id, restaurantId } });
    if (count > 0) throw conflict('category_not_empty', 'Move or delete the dishes in this category first');
    const r = await this.deps.db.menuCategory.deleteMany({ where: { id, restaurantId } });
    if (r.count === 0) throw notFound('Category');
    await this.changed(restaurantId);
  }

  // ───── Items ─────

  private async assertCategory(tx: Tx, restaurantId: string, categoryId: string) {
    const c = await tx.menuCategory.findFirst({ where: { id: categoryId, restaurantId }, select: { id: true } });
    if (!c) throw notFound('Category');
  }

  /** Replace variants and add-on groups; keeps ids that are sent back so order snapshots stay meaningful. */
  private async writeOptions(tx: Tx, restaurantId: string, itemId: string, input: Pick<ItemInput, 'variants' | 'addonGroups'>) {
    const keepVariantIds = input.variants.map((v) => v.id).filter((x): x is string => Boolean(x));
    await tx.itemVariant.deleteMany({ where: { itemId, restaurantId, id: { notIn: keepVariantIds } } });
    for (const [i, v] of input.variants.entries()) {
      if (v.id) await tx.itemVariant.updateMany({ where: { id: v.id, itemId, restaurantId }, data: { name: v.name, pricePaise: v.pricePaise, sortOrder: i } });
      else await tx.itemVariant.create({ data: { restaurantId, itemId, name: v.name, pricePaise: v.pricePaise, sortOrder: i } });
    }
    const keepGroupIds = input.addonGroups.map((g) => g.id).filter((x): x is string => Boolean(x));
    await tx.addonGroup.deleteMany({ where: { itemId, restaurantId, id: { notIn: keepGroupIds } } });
    for (const [gi, g] of input.addonGroups.entries()) {
      let groupId = g.id;
      if (groupId) {
        await tx.addonGroup.updateMany({ where: { id: groupId, itemId, restaurantId }, data: { name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi } });
      } else {
        groupId = (await tx.addonGroup.create({ data: { restaurantId, itemId, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi } })).id;
      }
      const keepAddonIds = g.addons.map((a) => a.id).filter((x): x is string => Boolean(x));
      await tx.addon.deleteMany({ where: { groupId, restaurantId, id: { notIn: keepAddonIds } } });
      for (const [ai, a] of g.addons.entries()) {
        if (a.id) await tx.addon.updateMany({ where: { id: a.id, groupId, restaurantId }, data: { name: a.name, pricePaise: a.pricePaise, available: a.available, sortOrder: ai } });
        else await tx.addon.create({ data: { restaurantId, groupId, name: a.name, pricePaise: a.pricePaise, available: a.available, sortOrder: ai } });
      }
    }
  }

  async createItem(restaurantId: string, input: ItemInput): Promise<MenuItemDto> {
    const item = await withTx(this.deps.db, async (tx) => {
      await this.assertCategory(tx, restaurantId, input.categoryId);
      const max = await tx.menuItem.aggregate({ where: { restaurantId, categoryId: input.categoryId }, _max: { sortOrder: true } });
      const { variants, addonGroups, ...fields } = input;
      const created = await tx.menuItem.create({ data: { ...fields, restaurantId, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
      await this.writeOptions(tx, restaurantId, created.id, { variants, addonGroups });
      return tx.menuItem.findUniqueOrThrow({ where: { id: created.id }, include: itemInclude });
    });
    await this.changed(restaurantId, { translate: true });
    return toItemDto(item);
  }

  async updateItem(restaurantId: string, id: string, input: UpdateItemInput): Promise<MenuItemDto> {
    const item = await withTx(this.deps.db, async (tx) => {
      const existing = await tx.menuItem.findFirst({ where: { id, restaurantId }, select: { id: true } });
      if (!existing) throw notFound('Dish');
      if (input.categoryId) await this.assertCategory(tx, restaurantId, input.categoryId);
      const { variants, addonGroups, ...fields } = input;
      if (Object.keys(fields).length) await tx.menuItem.update({ where: { id }, data: fields });
      if (variants || addonGroups) {
        const current = await tx.menuItem.findUniqueOrThrow({ where: { id }, include: itemInclude });
        await this.writeOptions(tx, restaurantId, id, {
          variants: variants ?? current.variants.map((v) => ({ id: v.id, name: v.name, pricePaise: v.pricePaise })),
          addonGroups:
            addonGroups ??
            current.addonGroups.map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, addons: g.addons.map((a) => ({ id: a.id, name: a.name, pricePaise: a.pricePaise, available: a.available })) })),
        });
      }
      return tx.menuItem.findUniqueOrThrow({ where: { id }, include: itemInclude });
    });
    await this.changed(restaurantId, { translate: input.name !== undefined || input.description !== undefined || Boolean(input.variants) || Boolean(input.addonGroups) });
    if (input.available !== undefined) this.deps.realtime.emit([rooms.menu(restaurantId)], 'menu.availability', { itemId: id, available: input.available, kind: 'item' });
    return toItemDto(item);
  }

  /** Soft delete: once any order references a dish it is hidden, never deleted (spec §3.5). */
  async deleteItem(restaurantId: string, id: string): Promise<{ deleted: boolean; hidden: boolean }> {
    const item = await this.deps.db.menuItem.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!item) throw notFound('Dish');
    const referenced = await this.deps.db.orderItem.count({ where: { itemId: id, restaurantId } });
    if (referenced > 0) {
      await this.deps.db.menuItem.update({ where: { id }, data: { visible: false } });
      await this.changed(restaurantId);
      return { deleted: false, hidden: true };
    }
    await this.deps.db.menuItem.delete({ where: { id } });
    await this.deps.db.translation.deleteMany({ where: { restaurantId, entityId: id } });
    await this.changed(restaurantId);
    return { deleted: true, hidden: false };
  }

  async setAvailability(restaurantId: string, id: string, available: boolean) {
    const r = await this.deps.db.menuItem.updateMany({ where: { id, restaurantId }, data: { available } });
    if (r.count === 0) throw notFound('Dish');
    await this.changed(restaurantId);
    this.deps.realtime.emit([rooms.menu(restaurantId)], 'menu.availability', { itemId: id, available, kind: 'item' });
  }

  async setAddonAvailability(restaurantId: string, id: string, available: boolean) {
    const r = await this.deps.db.addon.updateMany({ where: { id, restaurantId }, data: { available } });
    if (r.count === 0) throw notFound('Add-on');
    await this.changed(restaurantId);
    this.deps.realtime.emit([rooms.menu(restaurantId)], 'menu.availability', { itemId: id, available, kind: 'addon' });
  }

  async reorder(restaurantId: string, input: z.infer<typeof reorderInput>) {
    await withTx(this.deps.db, async (tx) => {
      for (const [i, id] of (input.categories ?? []).entries()) {
        await tx.menuCategory.updateMany({ where: { id, restaurantId }, data: { sortOrder: i } });
      }
      for (const group of input.items ?? []) {
        await this.assertCategory(tx, restaurantId, group.categoryId);
        for (const [i, id] of group.itemIds.entries()) {
          await tx.menuItem.updateMany({ where: { id, restaurantId }, data: { sortOrder: i, categoryId: group.categoryId } });
        }
      }
    });
    await this.changed(restaurantId);
  }

  async bulkPrice(restaurantId: string, input: z.infer<typeof bulkPriceInput>): Promise<{ updated: number }> {
    const updated = await withTx(this.deps.db, async (tx) => {
      const items = await tx.menuItem.findMany({ where: { id: { in: input.itemIds }, restaurantId }, include: { variants: true } });
      const apply = (p: number) => roundPrice(input.mode === 'percent' ? Math.round(p * (1 + input.value / 10_000)) : p + input.value, input.roundTo);
      for (const item of items) {
        await tx.menuItem.update({ where: { id: item.id }, data: { basePricePaise: Math.max(100, apply(item.basePricePaise)) } });
        for (const v of item.variants) await tx.itemVariant.update({ where: { id: v.id }, data: { pricePaise: Math.max(100, apply(v.pricePaise)) } });
      }
      return items.length;
    });
    await this.changed(restaurantId);
    return { updated };
  }

  // ───── Translations ─────

  async listTranslations(restaurantId: string, locale: string) {
    const rows = await this.deps.db.translation.findMany({ where: { restaurantId, locale } });
    return rows.map((t) => ({ entityType: t.entityType, entityId: t.entityId, locale: t.locale, field: t.field, value: t.value, source: t.source }));
  }

  /** Owner correction; marked manual so automatic translation never overwrites it. */
  async upsertTranslation(restaurantId: string, input: z.infer<typeof translationInput>) {
    await this.assertEntity(restaurantId, input.entityType, input.entityId);
    await this.deps.db.translation.upsert({
      where: { entityType_entityId_locale_field: { entityType: input.entityType, entityId: input.entityId, locale: input.locale, field: input.field } },
      create: { ...input, restaurantId, source: 'manual' },
      update: { value: input.value, source: 'manual' },
    });
    await this.changed(restaurantId);
  }

  private async assertEntity(restaurantId: string, type: string, id: string) {
    const where = { id, restaurantId };
    const found =
      type === 'category'
        ? await this.deps.db.menuCategory.count({ where })
        : type === 'item'
          ? await this.deps.db.menuItem.count({ where })
          : type === 'variant'
            ? await this.deps.db.itemVariant.count({ where })
            : type === 'addon_group'
              ? await this.deps.db.addonGroup.count({ where })
              : await this.deps.db.addon.count({ where });
    if (!found) throw notFound('Menu entry');
  }

  /** Job: fill missing (never manual) Hindi/Marathi translations. */
  async translateMissing(restaurantId: string): Promise<number> {
    const r = await this.deps.db.restaurant.findUnique({ where: { id: restaurantId }, select: { languages: true } });
    if (!r) return 0;
    const locales = r.languages.filter((l) => l !== 'en');
    if (locales.length === 0) return 0;
    const menu = await this.fullMenu(restaurantId);
    const existing = await this.deps.db.translation.findMany({ where: { restaurantId, locale: { in: locales } } });
    const have = new Set(existing.map((t) => `${t.entityType}:${t.entityId}:${t.locale}:${t.field}`));
    const stale = new Map(existing.filter((t) => t.source === 'ai').map((t) => [`${t.entityType}:${t.entityId}:${t.locale}:${t.field}`, t]));

    const sources: Array<{ key: string; type: string; id: string; field: string; text: string }> = [];
    const add = (type: string, id: string, field: string, text: string | null) => {
      if (text) sources.push({ key: `${type}:${id}:${field}`, type, id, field, text });
    };
    for (const c of menu) {
      add('category', c.id, 'name', c.name);
      for (const i of c.items) {
        add('item', i.id, 'name', i.name);
        add('item', i.id, 'description', i.description);
        for (const v of i.variants) add('variant', v.id, 'name', v.name);
        for (const g of i.addonGroups) {
          add('addon_group', g.id, 'name', g.name);
          for (const a of g.addons) add('addon', a.id, 'name', a.name);
        }
      }
    }
    const missing = sources.filter((s) => locales.some((l) => !have.has(`${s.type}:${s.id}:${l}:${s.field}`)));
    if (missing.length === 0) return 0;

    let written = 0;
    for (let i = 0; i < missing.length; i += 80) {
      const chunk = missing.slice(i, i + 80);
      const result = await this.deps.ai.translate(chunk.map((s) => ({ key: s.key, text: s.text })), locales);
      for (const l of locales) {
        for (const s of chunk) {
          const value = result[l]?.[s.key];
          const k = `${s.type}:${s.id}:${l}:${s.field}`;
          if (!value || (have.has(k) && !stale.has(k))) continue;
          await this.deps.db.translation.upsert({
            where: { entityType_entityId_locale_field: { entityType: s.type, entityId: s.id, locale: l, field: s.field } },
            create: { restaurantId, entityType: s.type, entityId: s.id, locale: l, field: s.field, value, source: 'ai' },
            update: { value },
          });
          written++;
        }
      }
    }
    this.cache.invalidate(restaurantId);
    return written;
  }

  // ───── Public menu ─────

  async publicMenu(slug: string, locale: Locale): Promise<PublicMenuDto | null> {
    const r = await this.deps.db.restaurant.findUnique({ where: { slug }, include: { wallet: { select: { orderingPaused: true } } } });
    if (!r || r.status === 'closed' || r.status === 'pending') return null;
    const key = `${r.id}:${locale}`;
    const now = this.deps.clock();
    const cached = this.cache.get(key);
    const open = isOpenAt(r.openingHours as never, now, r.timezone);
    const live = {
      isOpen: open,
      nextOpenLabel: open ? null : nextOpenLabel(r.openingHours as never, now, r.timezone),
      openingHoursLabel: todayHoursLabel(r.openingHours as never, now, r.timezone),
      orderingAvailable: open && canOrder(r, r.wallet).canOrder,
    };
    if (cached) return { ...cached, restaurant: { ...cached.restaurant, ...live } };

    const [cats, translations] = await Promise.all([
      this.deps.db.menuCategory.findMany({
        where: { restaurantId: r.id, visible: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { items: { where: { visible: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: itemInclude } },
      }),
      locale === 'en' ? Promise.resolve([]) : this.deps.db.translation.findMany({ where: { restaurantId: r.id, locale } }),
    ]);
    const t = new Map(translations.map((x) => [`${x.entityType}:${x.entityId}:${x.field}`, x.value]));
    const tr = (type: string, id: string, field = 'name') => t.get(`${type}:${id}:${field}`) ?? null;

    let latest = r.updatedAt.getTime();
    const categories = cats
      .filter((c) => c.items.length > 0)
      .map((c) => {
        latest = Math.max(latest, c.updatedAt.getTime());
        return {
          id: c.id,
          name: c.name,
          nameLocal: tr('category', c.id),
          items: c.items.map((i) => {
            latest = Math.max(latest, i.updatedAt.getTime());
            const dto = toItemDto(i);
            return {
              id: dto.id,
              categoryId: dto.categoryId,
              name: dto.name,
              nameLocal: tr('item', dto.id),
              description: dto.description,
              descriptionLocal: tr('item', dto.id, 'description'),
              diet: dto.diet,
              jainAvailable: dto.jainAvailable,
              spiceLevel: dto.spiceLevel,
              tags: dto.tags,
              basePricePaise: dto.basePricePaise,
              taxRateBp: dto.taxRateBp,
              photoUrl: dto.photoUrl,
              available: dto.available,
              variants: dto.variants.map((v) => ({ ...v, nameLocal: tr('variant', v.id) })),
              addonGroups: dto.addonGroups.map((g) => ({
                id: g.id,
                name: g.name,
                nameLocal: tr('addon_group', g.id),
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                addons: g.addons.map((a) => ({ ...a, nameLocal: tr('addon', a.id) })),
              })),
            };
          }),
        };
      });

    const dto: PublicMenuDto = {
      restaurant: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        logoUrl: r.logoUrl,
        coverUrl: r.coverUrl,
        address: r.address,
        city: r.city,
        cuisine: r.cuisine,
        languages: r.languages,
        theme: { primary: (r.theme as { primary?: string })?.primary ?? '#FC8019' },
        serviceChargeBp: r.serviceChargeBp,
        googleReviewUrl: r.googleReviewUrl,
        ...live,
      },
      locale,
      categories,
      version: String(latest),
    };
    this.cache.set(key, dto);
    return dto;
  }
}
