import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the running local stack (Supabase, API :4000, web :3000, console :3001).
 * Start them with `pnpm dev` after `pnpm db:seed`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'diner-mobile', testMatch: /diner\.spec\.ts/, use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
    { name: 'staff', testMatch: /(staff|wallet)\.spec\.ts/, dependencies: ['setup'], use: { viewport: { width: 1280, height: 900 }, storageState: 'e2e/.auth/owner.json' } },
  ],
});
