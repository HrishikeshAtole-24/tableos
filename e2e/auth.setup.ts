import { expect, test as setup } from '@playwright/test';
import { CONSOLE, latestOtp } from './helpers';

const EMAIL = 'owner@demo.tableos.in';

setup('owner signs in with an email OTP', async ({ page }) => {
  await page.goto(`${CONSOLE}/login`);
  const after = Date.now() - 2000;
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  const code = await latestOtp(EMAIL, after);
  await page.getByLabel('Digit 1').fill(code);
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText('Spice Route Café').first()).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/owner.json' });
});
