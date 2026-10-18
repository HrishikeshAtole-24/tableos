import { formatPaise } from '@tableos/schemas';
import type { Deps } from '../../context';
import { notFound } from '../../lib/errors';
import { escapeHtml as esc } from '../notifications/mailer';

/** Printable GST invoice for a recharge (browser "Save as PDF"). */
export async function renderInvoiceHtml(deps: Deps, restaurantId: string, invoiceId: string): Promise<string> {
  const inv = await deps.db.invoice.findFirst({
    where: { id: invoiceId, restaurantId },
    include: { restaurant: true, payment: { select: { reference: true, method: true, succeededAt: true } } },
  });
  if (!inv) throw notFound('Invoice');
  const pricing = await deps.db.pricingConfig.findFirst({ where: { OR: [{ restaurantId }, { restaurantId: null }] }, orderBy: { restaurantId: 'asc' } });
  const rate = ((pricing?.gstRateBp ?? 1800) / 100).toFixed(0);
  const r = inv.restaurant;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#02060c;margin:0;background:#f0f0f5}
  .page{max-width:760px;margin:24px auto;background:#fff;padding:40px;border-radius:16px}
  h1{font-size:22px;margin:0;color:#fc8019} .muted{color:#5c5f66;font-size:13px}
  table{width:100%;border-collapse:collapse;margin-top:24px} td,th{padding:10px 8px;border-bottom:1px solid #e9e9ee;text-align:left;font-size:14px}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5c5f66} .r{text-align:right}
  .tot td{font-weight:700;border-bottom:none;font-size:16px} .grid{display:flex;justify-content:space-between;gap:24px;margin-top:24px}
  @media print{body{background:#fff}.page{margin:0;border-radius:0}.noprint{display:none}}
</style></head><body><div class="page">
<div class="grid" style="margin-top:0"><div><h1>TableOS</h1><div class="muted">Tax invoice</div></div>
<div class="r"><div><b>${esc(inv.number)}</b></div><div class="muted">${inv.issuedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })}</div></div></div>
<div class="grid"><div><div class="muted">Billed to</div><b>${esc(r.name)}</b><div class="muted">${esc(r.address ?? '')}${r.city ? `, ${esc(r.city)}` : ''}</div>${r.gstin ? `<div class="muted">GSTIN ${esc(r.gstin)}</div>` : ''}</div>
<div class="r"><div class="muted">Payment reference</div><b>${esc(inv.payment.reference)}</b><div class="muted">${esc(inv.payment.method ?? '')}</div></div></div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
<tr><td>${esc(inv.description)}</td><td class="r">${formatPaise(inv.amountPaise)}</td></tr>
<tr><td>GST @ ${rate}%</td><td class="r">${formatPaise(inv.gstPaise)}</td></tr>
<tr class="tot"><td>Total paid</td><td class="r">${formatPaise(inv.totalPaise)}</td></tr></tbody></table>
<p class="muted" style="margin-top:32px">This is a computer-generated invoice and does not need a signature.</p>
<p class="noprint"><button onclick="window.print()" style="background:#fc8019;color:#fff;border:0;padding:12px 20px;border-radius:12px;font-weight:700;cursor:pointer">Download PDF</button></p>
</div></body></html>`;
}
