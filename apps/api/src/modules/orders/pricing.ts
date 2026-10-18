import type { Tx } from '@tableos/db';
import { type CartLineInput, totalOrder } from '@tableos/schemas';
import { unprocessable } from '../../lib/errors';

export interface PricedLine {
  itemId: string;
  nameSnapshot: string;
  variantSnapshot: { id: string; name: string } | null;
  addonsSnapshot: Array<{ id: string; name: string; pricePaise: number }>;
  unitPricePaise: number;
  qty: number;
  taxRateBp: number;
  note: string | null;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

/**
 * Re-price every line from the database; client prices are ignored (spec §3.7 Pricing).
 * Unavailable or hidden dishes fail the whole order with the list of offending items.
 */
export async function priceCart(tx: Tx, restaurantId: string, lines: CartLineInput[]): Promise<PricedCart> {
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await tx.menuItem.findMany({
    where: { id: { in: itemIds }, restaurantId },
    include: {
      category: { select: { visible: true } },
      variants: true,
      addonGroups: { include: { addons: true } },
    },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  const unavailable: Array<{ itemId: string; name: string }> = [];
  for (const id of itemIds) {
    const item = byId.get(id);
    if (!item || !item.available || !item.visible || !item.category.visible) {
      unavailable.push({ itemId: id, name: item?.name ?? 'Unknown dish' });
    }
  }

  const priced: PricedLine[] = [];
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item || unavailable.some((u) => u.itemId === line.itemId)) continue;

    let unit = item.basePricePaise;
    let variantSnapshot: PricedLine['variantSnapshot'] = null;
    if (item.variants.length > 0) {
      const v = item.variants.find((x) => x.id === line.variantId) ?? null;
      if (!v) throw unprocessable('variant_required', `Choose a size for ${item.name}`, { itemId: item.id });
      unit = v.pricePaise;
      variantSnapshot = { id: v.id, name: v.name };
    } else if (line.variantId) {
      throw unprocessable('invalid_variant', `${item.name} has no sizes`, { itemId: item.id });
    }

    const addonsSnapshot: PricedLine['addonsSnapshot'] = [];
    const chosen = new Set(line.addonIds);
    for (const g of item.addonGroups) {
      const picked = g.addons.filter((a) => chosen.has(a.id));
      if (picked.length < g.minSelect || picked.length > g.maxSelect) {
        throw unprocessable('invalid_addons', `Check the "${g.name}" options for ${item.name}`, { itemId: item.id, groupId: g.id });
      }
      for (const a of picked) {
        if (!a.available) unavailable.push({ itemId: item.id, name: `${item.name} (${a.name})` });
        addonsSnapshot.push({ id: a.id, name: a.name, pricePaise: a.pricePaise });
        unit += a.pricePaise;
        chosen.delete(a.id);
      }
    }
    if (chosen.size > 0) throw unprocessable('invalid_addons', `Some options are not offered for ${item.name}`, { itemId: item.id });

    priced.push({
      itemId: item.id,
      nameSnapshot: item.name,
      variantSnapshot,
      addonsSnapshot,
      unitPricePaise: unit,
      qty: line.qty,
      taxRateBp: item.taxRateBp,
      note: line.note,
    });
  }

  if (unavailable.length > 0) {
    throw unprocessable('items_unavailable', 'Some dishes just sold out', { unavailable });
  }
  const totals = totalOrder(priced);
  return { lines: priced, ...totals };
}
