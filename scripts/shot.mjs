// Dev helper: screenshot a URL at a given width. Usage: node scripts/shot.mjs <url> <out.png> [width] [fullPage] [clickSelector]
import { chromium } from '@playwright/test';
const [url, out, width = '390', full = 'false', click] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
if (click) { for (const sel of click.split('||')) { await page.click(sel); await page.waitForTimeout(600); } }
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: full === 'true' });
await browser.close();
console.log('saved', out);
