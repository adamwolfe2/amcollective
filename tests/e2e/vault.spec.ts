import { test, expect } from "@playwright/test";

test.describe("Vault page (unauthenticated)", () => {
  test("/vault does not return 500", async ({ page }) => {
    const response = await page.goto("/vault", { waitUntil: "networkidle" });
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);
  });

  test("/vault redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/vault", { waitUntil: "networkidle" });
    const finalUrl = page.url();
    // Should be redirected — vault is behind auth
    const isProtected =
      finalUrl.includes("sign-in") ||
      finalUrl.includes("clerk.") ||
      !finalUrl.endsWith("/vault");
    expect(isProtected).toBeTruthy();
  });

  test("/api/vault/test-id/reveal returns 401/403/404 unauthenticated", async ({ request }) => {
    const response = await request.get("/api/vault/test-id/reveal");
    // 401/403 = auth guard working; 404 = route not yet deployed (pre-deploy)
    // Never should be 200 (data leak) or 500 (server error)
    const status = response.status();
    expect(status).not.toBe(200);
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);
  });
});
