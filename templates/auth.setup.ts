import { test as setup, expect } from '@playwright/test';

/**
 * Form-login setup. Runs once before the test projects that depend on it and
 * saves the authenticated session to reuse via `storageState`.
 *
 * Credentials come from env vars — never hardcode them.
 * Wire this up in playwright.config.ts:
 *
 *   projects: [
 *     { name: 'setup', testMatch: /auth\.setup\.ts/ },
 *     { name: 'chromium', dependencies: ['setup'],
 *       use: { storageState: 'reports/.auth/user.json' } },
 *   ]
 */
const authFile = 'reports/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const user = process.env.TEST_USER;
  const pass = process.env.TEST_PASS;
  if (!user || !pass) {
    throw new Error('Set TEST_USER and TEST_PASS env vars before running auth setup.');
  }

  await page.goto(process.env.LOGIN_URL ?? '/login');
  await page.getByLabel('Email').fill(user);
  await page.getByLabel('Password').fill(pass);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Adjust to a stable post-login signal for your app.
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: authFile });
});
