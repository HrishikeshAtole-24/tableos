// Captures every product screen from the running local stack into design/screens/ (for Figma).
// Usage: node scripts/capture-screens.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const WEB = 'http://localhost:3000';
const CONSOLE = 'http://localhost:3001';
const MAILPIT = 'http://127.0.0.1:54324';
const OUT = join(process.cwd(), 'design', 'screens');
mkdirSync(OUT, { recursive: true });

const link = (label) =>
  execFileSync('npx', ['tsx', '--env-file=../../.env', 'scripts/qr-link.ts', label], { cwd: join(process.cwd(), 'apps', 'api'), encoding: 'utf8', shell: true }).trim().split('\n').pop().trim();

async function otp(email, after) {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=10`).then((r) => r.json()).catch(() => null);
    const msg = res?.messages?.find((m) => m.To.some((t) => t.Address === email) && new Date(m.Created).getTime() > after);
    if (msg) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json());
      const code = [full.Text, full.HTML].join(' ').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('no otp');
}

const browser = await chromium.launch();
const shot = async (page, name, full = false) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  console.log('saved', name);
};

// ── Diner (390px @2x) ──
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const d = await mobile.newPage();
await d.goto(link('T8'), { waitUntil: 'networkidle' });
await shot(d, '02-diner-01-menu');
await shot(d, '02-diner-02-menu-full', true);
await d.getByRole('button', { name: 'Add Paneer Tikka' }).first().click();
await shot(d, '02-diner-03-dish-sheet');
await d.getByText('Full (12 pcs)').click();
await d.getByRole('button', { name: /Add item/ }).click();
await d.getByRole('button', { name: 'Add Samosa (2 pcs)' }).click();
await d.getByRole('button', { name: 'Add Samosa (2 pcs)' }).first().isVisible().catch(() => null);
await shot(d, '02-diner-04-cart-bar');
await d.getByRole('button', { name: /View Cart/ }).click();
await shot(d, '02-diner-05-cart');
await d.getByRole('button', { name: 'Place order' }).click();
await shot(d, '02-diner-06-order-placed');
await d.getByRole('button', { name: 'Track orders' }).click();
await shot(d, '02-diner-07-order-tracking');
await d.goto(link('T8'), { waitUntil: 'networkidle' });
await d.getByRole('button', { name: 'Need something?' }).click();
await shot(d, '02-diner-08-call-staff');
await d.keyboard.press('Escape');
await d.getByRole('button', { name: 'Language' }).click();
await d.getByRole('radio', { name: 'हिंदी' }).click();
await d.waitForTimeout(1500);
await shot(d, '02-diner-09-hindi');
await d.goto(`${WEB}/r/spice-route-cafe?t=invalid.token`, { waitUntil: 'networkidle' });
await shot(d, '02-diner-10-invalid-qr');
// A couple more orders so the staff board has content.
for (const [t, dishName] of [['R1', 'Add Kanda Poha'], ['R2', 'Add Samosa (2 pcs)']]) {
  const p = await mobile.newPage();
  try {
  await p.goto(link(t), { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: dishName }).first().click();
  const add = p.getByRole('button', { name: /Add item/ });
  if (await add.isVisible().catch(() => false)) await add.click();
  await p.getByRole('button', { name: /View Cart/ }).click();
  await p.getByRole('button', { name: 'Place order' }).click();
  await p.waitForTimeout(800);
  } catch (e) {
    console.warn('extra order skipped', t, String(e.message).slice(0, 120));
  }
  await p.close();
}

// ── Brand website (1440) ──
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const w = await desk.newPage();
for (const [path, name] of [['/', 'home'], ['/features', 'features'], ['/pricing', 'pricing'], ['/demo', 'demo'], ['/contact', 'contact']]) {
  await w.goto(`${WEB}${path}`, { waitUntil: 'networkidle' });
  await shot(w, `02-web-${name}`, true);
}
const wm = await mobile.newPage();
await wm.goto(`${WEB}/`, { waitUntil: 'networkidle' });
await shot(wm, '02-web-home-mobile', true);

// ── Console (1440) ──
const c = await desk.newPage();
await c.goto(`${CONSOLE}/login`, { waitUntil: 'networkidle' });
await shot(c, '03-console-01-login');
const t0 = Date.now() - 2000;
await c.getByLabel('Email address').fill('owner@demo.tableos.in');
await c.getByRole('button', { name: 'Send code' }).click();
await c.waitForTimeout(800);
await shot(c, '03-console-02-otp');
await c.getByLabel('Digit 1').fill(await otp('owner@demo.tableos.in', t0));
await c.waitForURL(/dashboard/);
const pages = [
  ['/dashboard', '03-console-03-dashboard'],
  ['/orders', '03-console-04-live-orders'],
  ['/waiter', '03-console-06-waiter'],
  ['/menu', '03-console-07-menu'],
  ['/menu/import', '03-console-09-ai-import'],
  ['/tables', '03-console-10-tables-qr'],
  ['/wallet', '03-console-11-wallet'],
  ['/insights', '03-console-12-insights'],
  ['/staff', '03-console-13-staff'],
  ['/settings', '03-console-14-settings'],
  ['/admin', '03-console-15-admin'],
];
for (const [path, name] of pages) {
  await c.goto(`${CONSOLE}${path}`, { waitUntil: 'networkidle' });
  await c.waitForTimeout(1200);
  await shot(c, name, true);
}
await c.goto(`${CONSOLE}/menu`, { waitUntil: 'networkidle' });
await c.getByRole('button', { name: 'Edit dish' }).first().click();
await shot(c, '03-console-08-dish-editor');
await c.goto(`${CONSOLE}/orders`, { waitUntil: 'networkidle' });
await c.getByRole('tab', { name: /Tables/ }).click();
await shot(c, '03-console-05-tables-view');
// Kitchen: accept one order first so a ticket shows.
const accept = c.getByRole('button', { name: 'Accept' }).first();
await c.getByRole('tab', { name: /Board/ }).click();
if (await accept.isVisible().catch(() => false)) await accept.click();
await c.waitForTimeout(800);
const k = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, storageState: await c.context().storageState() })).newPage();
await k.goto(`${CONSOLE}/kitchen`, { waitUntil: 'networkidle' });
await k.getByRole('button', { name: 'Tap to start the kitchen screen' }).click();
await shot(k, '03-kitchen-display');

await browser.close();
console.log('done');
