// Measures first-load JS/CSS (compressed) and LCP for a page. Usage: node scripts/perf-budget.mjs <url>
import { chromium } from '@playwright/test';
const url = process.argv[2];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const sizes = { js: 0, css: 0 };
page.on('requestfinished', async (req) => {
  const type = req.resourceType();
  if (type !== 'script' && type !== 'stylesheet') return;
  const s = await req.sizes().catch(() => null);
  if (s) sizes[type === 'script' ? 'js' : 'css'] += s.responseBodySize;
});
await page.goto(url, { waitUntil: 'load' });
const lcp = await page.evaluate(() => new Promise((resolve) => {
  new PerformanceObserver((l) => { const e = l.getEntries(); resolve(e[e.length - 1]?.startTime ?? 0); }).observe({ type: 'largest-contentful-paint', buffered: true });
  setTimeout(() => resolve(-1), 3000);
}));
const cls = await page.evaluate(() => new Promise((resolve) => { let v = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => resolve(v), 1500); }));
console.log(JSON.stringify({ jsKB: +(sizes.js / 1024).toFixed(1), cssKB: +(sizes.css / 1024).toFixed(1), lcpMs: Math.round(lcp), cls: +Number(cls).toFixed(3) }));
await browser.close();
