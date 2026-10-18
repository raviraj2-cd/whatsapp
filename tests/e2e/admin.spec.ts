import { test, expect } from "@playwright/test";

test.describe("FoodOps Admin Dashboard E2E", () => {
  test("Redirects unauthenticated user to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator("h1")).toContainText("FoodOps Login");
  });

  test("Logs in successfully with owner credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[type="email"]', "admin@example.com");
    await page.fill('input[type="password"]', "AdminPassword123!");
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
    await expect(page.locator("h1")).toContainText("Kitchen Overview");
  });

  test("Navigates to Orders page and switches tabs", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', "admin@example.com");
    await page.fill('input[type="password"]', "AdminPassword123!");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*\/dashboard/);

    // Click Orders in navbar
    await page.click('a[href="/orders"]');
    await expect(page).toHaveURL(/.*\/orders/);
    await expect(page.locator("h1")).toContainText("Orders Management");

    // Click Custom Orders tab
    await page.click('button:has-text("Custom Orders")');
    await expect(page.locator("table")).toBeVisible();
  });
});
