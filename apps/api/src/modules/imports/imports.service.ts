import { type ExtractedMenu, IMPORT_LIMITS, type MenuImportDto, extractedMenu } from '@tableos/schemas';
import type { MenuImport } from '@tableos/db';
import type { Deps } from '../../context';
import { badRequest, notFound, tooMany, unprocessable } from '../../lib/errors';
import { iso } from '../../lib/http';
import { withTx } from '../../lib/tx';
import { JOBS } from '../../jobs/queue';

const MAX_VALIDATION_RETRIES = 2;

function toDto(m: MenuImport): MenuImportDto {
  const parsed = m.result ? extractedMenu.safeParse(m.result) : null;
  return {
    id: m.id,
    status: m.status,
    fileCount: m.fileUrls.length,
    result: parsed?.success ? parsed.data : null,
    error: m.error,
    createdAt: m.createdAt.toISOString(),
    publishedAt: iso(m.publishedAt),
  };
}

const extOf = (p: string) => p.split('.').pop()?.toLowerCase() ?? '';
const contentTypeOf = (p: string) => (extOf(p) === 'pdf' ? 'application/pdf' : extOf(p) === 'png' ? 'image/png' : 'image/jpeg');

export class ImportsService {
  constructor(private readonly deps: Deps) {}

  async create(restaurantId: string, userId: string, filePaths: string[]): Promise<MenuImportDto> {
    for (const p of filePaths) {
      if (!this.deps.storage.ownsPath(restaurantId, p) || !['jpg', 'jpeg', 'png', 'pdf'].includes(extOf(p))) {
        throw badRequest('Upload JPG, PNG or PDF files only');
      }
    }
    const since = new Date(this.deps.clock().getTime() - 24 * 3_600_000);
    const today = await this.deps.db.menuImport.count({ where: { restaurantId, createdAt: { gte: since } } });
    if (today >= IMPORT_LIMITS.perDay) throw tooMany(`You can run ${IMPORT_LIMITS.perDay} menu imports per day`);
    const m = await this.deps.db.menuImport.create({ data: { restaurantId, createdBy: userId, fileUrls: filePaths } });
    await this.deps.jobs.send(JOBS.menuImport, { importId: m.id });
    return toDto(m);
  }

  async get(restaurantId: string, id: string): Promise<MenuImportDto> {
    const m = await this.deps.db.menuImport.findFirst({ where: { id, restaurantId } });
    if (!m) throw notFound('Import');
    return toDto(m);
  }

  async list(restaurantId: string): Promise<MenuImportDto[]> {
    const rows = await this.deps.db.menuImport.findMany({ where: { restaurantId }, orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(toDto);
  }

  /** Owner edits in the review screen. */
  async update(restaurantId: string, id: string, result: ExtractedMenu): Promise<MenuImportDto> {
    const m = await this.deps.db.menuImport.findFirst({ where: { id, restaurantId } });
    if (!m) throw notFound('Import');
    if (m.status !== 'ready') throw unprocessable('import_not_ready', 'This import cannot be edited now');
    return toDto(await this.deps.db.menuImport.update({ where: { id }, data: { result } }));
  }

  /**
   * Job: send each page to the AI service, validate with Zod, retry an invalid result twice,
   * then mark failed (spec §3.7 Pipeline).
   */
  async process(importId: string): Promise<void> {
    const m = await this.deps.db.menuImport.findUnique({ where: { id: importId } });
    if (!m || m.status === 'published' || m.status === 'ready') return;
    await this.deps.db.menuImport.update({ where: { id: importId }, data: { status: 'processing' } });
    const files = m.fileUrls.map((p) => ({ url: this.deps.storage.publicUrl(p), contentType: contentTypeOf(p) }));

    let lastError = 'Unknown error';
    for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
      try {
        const raw = await this.deps.ai.extractMenu(files);
        const parsed = extractedMenu.safeParse(raw);
        if (parsed.success) {
          await this.deps.db.menuImport.update({ where: { id: importId }, data: { status: 'ready', result: parsed.data, error: null, attempts: attempt + 1 } });
          return;
        }
        lastError = `Invalid AI output: ${parsed.error.issues[0]?.message ?? 'schema mismatch'}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    await this.deps.db.menuImport.update({
      where: { id: importId },
      data: { status: 'failed', error: lastError.slice(0, 500), attempts: MAX_VALIDATION_RETRIES + 1 },
    });
  }

  async retry(restaurantId: string | null, id: string): Promise<MenuImportDto> {
    const m = await this.deps.db.menuImport.findFirst({ where: { id, ...(restaurantId ? { restaurantId } : {}) } });
    if (!m) throw notFound('Import');
    if (m.status !== 'failed') throw unprocessable('not_failed', 'Only failed imports can be retried');
    const updated = await this.deps.db.menuImport.update({ where: { id }, data: { status: 'queued', error: null } });
    await this.deps.jobs.send(JOBS.menuImport, { importId: id });
    return toDto(updated);
  }

  /** Publish writes categories, items and variants in one transaction; nothing goes live before this. */
  async publish(restaurantId: string, id: string): Promise<{ categories: number; items: number }> {
    const counts = await withTx(this.deps.db, async (tx) => {
      const m = await tx.menuImport.findFirst({ where: { id, restaurantId } });
      if (!m) throw notFound('Import');
      if (m.status !== 'ready') throw unprocessable('import_not_ready', 'This import is not ready to publish');
      const result = extractedMenu.parse(m.result);
      const existingCats = await tx.menuCategory.findMany({ where: { restaurantId } });
      let catSort = existingCats.reduce((a, c) => Math.max(a, c.sortOrder), -1) + 1;
      let items = 0;
      for (const c of result.categories) {
        const items0 = c.items.filter((i) => i.pricePaise !== null || i.variants.length > 0);
        if (items0.length === 0) continue;
        const cat =
          existingCats.find((e) => e.name.toLowerCase() === c.name.toLowerCase()) ??
          (await tx.menuCategory.create({ data: { restaurantId, name: c.name, sortOrder: catSort++ } }));
        for (const [i, it] of items0.entries()) {
          const base = it.variants.length ? Math.min(...it.variants.map((v) => v.pricePaise)) : it.pricePaise!;
          await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId: cat.id,
              name: it.name,
              description: it.description,
              diet: it.diet ?? 'veg',
              basePricePaise: Math.max(100, base),
              sortOrder: 1000 + i,
              variants: { create: it.variants.map((v, vi) => ({ restaurantId, name: v.name, pricePaise: v.pricePaise, sortOrder: vi })) },
            },
          });
          items++;
        }
      }
      await tx.menuImport.update({ where: { id }, data: { status: 'published', publishedAt: this.deps.clock() } });
      return { categories: result.categories.length, items };
    });
    await this.deps.jobs.send(JOBS.menuTranslate, { restaurantId }, { singletonKey: `translate:${restaurantId}` });
    return counts;
  }
}
