import { expect, test } from '@playwright/test';
import { CONSOLE } from './helpers';

const rupees = (s: string) => Number(s.replace(/[^\d.-]/g, ''));

test('wallet recharge through the payment gateway credits only after verification', async ({ page }) => {
  await page.goto(`${CONSOLE}/wallet`);
  const balanceEl = page.locator('[class*="walletBalance"]');
  await expect(balanceEl).toBeVisible();
  const before = rupees(await balanceEl.innerText());

  await page.getByRole('button', { name: '₹200', exact: true }).click();
  await page.getByRole('button', { name: 'Pay ₹236' }).click();
  // Mock gateway (development only) behaves like a hosted checkout with a signed webhook.
  await expect(page.getByText('Test checkout')).toBeVisible();
  await page.getByRole('button', { name: /simulate success/ }).click();

  await page.waitForURL(/\/wallet\?payment=/);
  await expect(page.getByText('Payment received')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => rupees(await balanceEl.innerText())).toBe(before + 200);
  await page.getByRole('tab', { name: 'Invoices' }).click();
  await expect(page.getByText(/TOS\/\d{4}-\d{2}\/\d{6}/).first()).toBeVisible();
});
