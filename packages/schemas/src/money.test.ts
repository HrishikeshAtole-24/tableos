import { describe, expect, it } from 'vitest';
import { computeBill, formatPaise, totalOrder } from './money.js';

describe('money', () => {
  it('formats paise as rupees', () => {
    expect(formatPaise(24900)).toBe('₹249');
    expect(formatPaise(24950)).toBe('₹249.50');
    expect(formatPaise(12345600)).toBe('₹1,23,456');
  });

  it('computes per-line tax', () => {
    const t = totalOrder([
      { unitPricePaise: 24900, qty: 2, taxRateBp: 500 },
      { unitPricePaise: 9900, qty: 1, taxRateBp: 1800 },
    ]);
    expect(t).toEqual({ subtotalPaise: 59700, taxPaise: 2490 + 1782, totalPaise: 59700 + 4272 });
  });

  it('rounds the bill to the nearest rupee with a round-off line', () => {
    const b = computeBill({ lines: [{ unitPricePaise: 24950, qty: 1, taxRateBp: 500 }], serviceChargeBp: 0, discountPaise: 0 });
    // 24950 + 1248 = 26198 → 26200
    expect(b.taxPaise).toBe(1248);
    expect(b.roundOffPaise).toBe(2);
    expect(b.totalPaise).toBe(26200);
  });

  it('applies service charge and caps discount', () => {
    const b = computeBill({ lines: [{ unitPricePaise: 10000, qty: 1, taxRateBp: 0 }], serviceChargeBp: 1000, discountPaise: 999999 });
    expect(b.serviceChargePaise).toBe(1000);
    expect(b.discountPaise).toBe(11000);
    expect(b.totalPaise).toBe(0);
  });
});
