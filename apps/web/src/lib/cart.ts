import type { PublicMenuItem } from '@tableos/schemas';

export interface CartLine {
  key: string;
  itemId: string;
  variantId: string | null;
  addonIds: string[];
  qty: number;
  note: string | null;
  /** Display snapshot; the server re-prices on order. */
  name: string;
  variantName: string | null;
  addonNames: string[];
  unitPricePaise: number;
  taxRateBp: number;
  diet: PublicMenuItem['diet'];
}

export interface CartState {
  lines: CartLine[];
  note: string;
}

export type CartAction =
  | { type: 'add'; line: Omit<CartLine, 'key' | 'qty'>; qty?: number }
  | { type: 'inc'; key: string }
  | { type: 'dec'; key: string }
  | { type: 'remove'; key: string }
  | { type: 'removeItems'; itemIds: string[] }
  | { type: 'note'; note: string }
  | { type: 'clear' }
  | { type: 'hydrate'; state: CartState };

export const lineKey = (l: { itemId: string; variantId: string | null; addonIds: string[]; note: string | null }) =>
  [l.itemId, l.variantId ?? '-', [...l.addonIds].sort().join('+') || '-', (l.note ?? '').trim().toLowerCase()].join('|');

export const EMPTY_CART: CartState = { lines: [], note: '' };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const key = lineKey(action.line);
      const existing = state.lines.find((l) => l.key === key);
      const qty = action.qty ?? 1;
      if (existing) return { ...state, lines: state.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(50, l.qty + qty) } : l)) };
      return { ...state, lines: [...state.lines, { ...action.line, key, qty }] };
    }
    case 'inc':
      return { ...state, lines: state.lines.map((l) => (l.key === action.key ? { ...l, qty: Math.min(50, l.qty + 1) } : l)) };
    case 'dec':
      return { ...state, lines: state.lines.flatMap((l) => (l.key === action.key ? (l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []) : [l])) };
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case 'removeItems':
      return { ...state, lines: state.lines.filter((l) => !action.itemIds.includes(l.itemId)) };
    case 'note':
      return { ...state, note: action.note };
    case 'clear':
      return EMPTY_CART;
    case 'hydrate':
      return action.state;
  }
}

export function cartCount(state: CartState): number {
  return state.lines.reduce((a, l) => a + l.qty, 0);
}

export function qtyForItem(state: CartState, itemId: string): number {
  return state.lines.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0);
}

const storageKey = (scope: string) => `tos-cart:${scope}`;

export function loadCart(scope: string): CartState {
  try {
    const raw = sessionStorage.getItem(storageKey(scope));
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as CartState;
    return Array.isArray(parsed.lines) ? parsed : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

export function saveCart(scope: string, state: CartState): void {
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode): the cart still works in memory */
  }
}
