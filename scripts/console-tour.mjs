// Dev helper: log into the console with email OTP (read from local Mailpit) and screenshot pages.
// Usage: node scripts/console-tour.mjs <email> <outDir> [width] [path1,path2,...]
import { chromium } from '@playwright/test';

const [email = 'owner@demo.tableos.in', outDir = '.', width = '1280', pathsArg = '/dashboard,/orders,/menu,/tables,/wallet,/kitchen,/insights,/settings'] = process.argv.slice(2);
const CONSOLE = process.env.CONSOLE_URL ?? 'http://localhost:3001';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

async function latestCode(after) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=5`).then((r) => r.json()).catch(() => null);
    const msg = res?.messages?.find((m) => m.To?.some((t) => t.Address === email) && new Date(m.Created).getTime() > after);
    if (msg) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
      const code = (full.Text || full.HTML || '').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('No OTP email arrived');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
await page.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${outDir}/c-login.png` });
const t0 = Date.now() - 2000;
await page.fill('input[type=email]', email);
await page.click('button[type=submit]');
const code = await latestCode(t0);
console.log('otp', code);
await page.locator('input[aria-label="Digit 1"]').fill(code);
await page.waitForURL(/dashboard|onboarding/, { timeout: 30000 }).catch(async (e) => { await page.screenshot({ path: `${outDir}/c-fail.png` }); throw e; });
await page.waitForTimeout(2500);
for (const p of pathsArg.split(',')) {
  await page.goto(`${CONSOLE}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  if (p === '/kitchen') await page.click('text=Tap to start the kitchen screen').catch(() => {});
  await page.waitForTimeout(400);
  const name = `c${p.replace(/\//g, '-') || '-root'}.png`;
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: p !== '/kitchen' });
  console.log('saved', name);
}
await browser.close();
