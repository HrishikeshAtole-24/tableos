import { expect, test } from '@playwright/test';
import { WEB, tableLink } from './helpers';

test.describe('diner at 360px', () => {
  test('scan, browse, customise, order and track', async ({ page }) => {
    await page.goto(tableLink('T5'));
    await expect(page.getByRole('heading', { name: 'Spice Route Café' })).toBeVisible();
    await expect(page.getByText('Table T5').first()).toBeVisible();

    // Typo-tolerant search.
    await page.getByPlaceholder('Search for dishes').fill('panner tika');
    await expect(page.getByRole('heading', { name: 'Paneer Tikka' })).toBeVisible();
    await page.getByPlaceholder('Search for dishes').fill('');

    // Customisable dish opens the sheet; choose Full.
    await page.getByRole('button', { name: 'Add Paneer Tikka' }).first().click();
    await page.getByText('Full (12 pcs)').click();
    await page.getByRole('button', { name: /Add item/ }).click();
    // Plain dish adds straight to the cart.
    await page.getByRole('button', { name: 'Add Samosa (2 pcs)' }).click();
    await expect(page.getByText('2 items added')).toBeVisible();

    await page.getByRole('button', { name: /View Cart/ }).click();
    await expect(page.getByText('Bill details')).toBeVisible();
    await expect(page.getByText('To pay')).toBeVisible();
    await page.getByRole('button', { name: 'Place order' }).click();

    await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
    await page.getByRole('button', { name: 'Track orders' }).click();
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
  });

  test('a link without a table opens the menu view-only', async ({ page }) => {
    await page.goto(`${WEB}/r/spice-route-cafe`);
    await expect(page.getByText('You can browse the menu.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Samosa (2 pcs)' })).toHaveCount(0);
  });

  test('an invalid QR shows a clear message', async ({ page }) => {
    await page.goto(`${WEB}/r/spice-route-cafe?t=invalid.token-value`);
    await expect(page.getByRole('heading', { name: 'This QR code is no longer valid' })).toBeVisible();
  });
});
