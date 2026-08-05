import { test, expect } from '@playwright/test';

/**
 * Template: one `test(...)` per QEngine test case.
 * Keep the `[TC-xxx]` prefix in the title so results map back to QEngine.
 * Prefer role/label/text selectors and web-first assertions (auto-waiting).
 */

test.describe('Authentication', () => {
  test('[TC-001] User can log in with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('Secret123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  test('[TC-002] Login fails with invalid password', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
    await expect(page).toHaveURL(/\/login/);
  });
});
