/**
 * Pure money helpers shared by the API (authoritative) and the frontends (display).
 * All amounts are integer paise; tax and service-charge rates are basis points.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrFraction = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 24900 → "₹249", 24950 → "₹249.50" */
export function formatPaise(value: number): string {
  return value % 100 === 0 ? inrWhole.format(value / 100) : inrFraction.format(value / 100);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Round half away from zero, to whole paise. */
export function roundPaise(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function applyBasisPoints(amountPaise: number, bp: number): number {
  return roundPaise((amountPaise * bp) / 10_000);
}

export interface PricedLineInput {
  unitPricePaise: number;
  qty: number;
  taxRateBp: number;
}

export interface PricedLine {
  lineSubtotalPaise: number;
  lineTaxPaise: number;
}

export function priceLine(line: PricedLineInput): PricedLine {
  const lineSubtotalPaise = line.unitPricePaise * line.qty;
  return { lineSubtotalPaise, lineTaxPaise: applyBasisPoints(lineSubtotalPaise, line.taxRateBp) };
}

export interface OrderTotals {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export function totalOrder(lines: PricedLineInput[]): OrderTotals {
  let subtotalPaise = 0;
  let taxPaise = 0;
  for (const l of lines) {
    const p = priceLine(l);
    subtotalPaise += p.lineSubtotalPaise;
    taxPaise += p.lineTaxPaise;
  }
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

export interface BillInput {
  lines: PricedLineInput[];
  serviceChargeBp: number;
  discountPaise: number;
}

export interface BillTotals {
  subtotalPaise: number;
  taxPaise: number;
  serviceChargePaise: number;
  discountPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

/**
 * Bill maths (spec §3.7 Billing): tax per item, service charge on the subtotal,
 * discount capped at subtotal + tax + service charge, final total rounded to the
 * nearest rupee with a visible round-off line.
 */
export function computeBill(input: BillInput): BillTotals {
  const { subtotalPaise, taxPaise } = totalOrder(input.lines);
  const serviceChargePaise = applyBasisPoints(subtotalPaise, input.serviceChargeBp);
  const gross = subtotalPaise + taxPaise + serviceChargePaise;
  const discountPaise = Math.min(Math.max(0, input.discountPaise), gross);
  const beforeRound = gross - discountPaise;
  const rounded = Math.round(beforeRound / 100) * 100;
  return {
    subtotalPaise,
    taxPaise,
    serviceChargePaise,
    discountPaise,
    roundOffPaise: rounded - beforeRound,
    totalPaise: rounded,
  };
}
