import { expect, test } from '@playwright/test';
import { CONSOLE, tableLink } from './helpers';

test('owner accepts a QR order and the kitchen takes it to ready', async ({ page, browser }) => {
  // A diner orders from T6 in a separate browser context.
  const dinerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const diner = await dinerContext.newPage();
  await diner.goto(tableLink('T6'));
  await diner.getByRole('button', { name: 'Add Masala Dosa' }).first().click();
  await diner.getByRole('button', { name: /Add item/ }).click();
  await diner.getByRole('button', { name: /View Cart/ }).click();
  await diner.getByRole('button', { name: 'Place order' }).click();
  await expect(diner.getByRole('heading', { name: 'Order placed' })).toBeVisible();
  await diner.getByRole('button', { name: 'Track orders' }).click();

  await page.goto(`${CONSOLE}/orders`);
  const card = page.locator('article').filter({ hasText: 'T6' }).filter({ hasText: 'Masala Dosa' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(page.locator('section[aria-label="Accepted"]').getByText('Masala Dosa').first()).toBeVisible();

  // The guest sees the update live.
  await expect(diner.getByText('Accepted').first()).toBeVisible();

  await page.goto(`${CONSOLE}/kitchen`);
  await page.getByRole('button', { name: 'Tap to start the kitchen screen' }).click();
  const ticket = page.locator('article').filter({ hasText: 'T6' }).filter({ hasText: 'Masala Dosa' }).first();
  await ticket.getByRole('button', { name: 'START PREPARING' }).click();
  await ticket.getByRole('button', { name: 'MARK READY' }).click();
  await expect(page.locator('article').filter({ hasText: 'T6' }).filter({ hasText: 'Masala Dosa' })).toHaveCount(0);
  await dinerContext.close();
});
