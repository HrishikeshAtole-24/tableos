import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
page.on('requestfinished', async (req) => {
  if (req.resourceType() !== 'script') return;
  const s = await req.sizes().catch(() => null);
  const res = await req.response();
  rows.push({ url: req.url().split('/').pop().slice(0, 40), kb: +((s?.responseBodySize ?? 0) / 1024).toFixed(1), enc: res?.headers()['content-encoding'] ?? 'none' });
});
await page.goto(process.argv[2], { waitUntil: 'networkidle' });
rows.sort((a, b) => b.kb - a.kb).forEach((r) => console.log(r.kb, r.enc, r.url));
await browser.close();
