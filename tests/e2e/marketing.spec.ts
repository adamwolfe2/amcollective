import { test, expect } from "@playwright/test";

test.describe("Marketing page", () => {
  test("homepage loads and renders without error", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(500);
    // Should not show Next.js error overlay
    const errorOverlay = page.locator("body[data-nextjs-dialog-overlay]");
    await expect(errorOverlay).not.toBeAttached();
  });

  test("homepage has a link pointing to /sign-in or /dashboard", async ({ page }) => {
    await page.goto("/");
    // Should have at least one link to sign-in or dashboard
    const ctaLinks = page.locator('a[href*="sign-in"], a[href*="dashboard"], a[href*="login"]');
    const count = await ctaLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("/sign-in URL is reachable and returns 200", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response?.status()).toBe(200);
  });
});
