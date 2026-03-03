import { test, expect } from "@playwright/test";

test.describe("Sprints pages (unauthenticated)", () => {
  test("/sprints does not return 500", async ({ page }) => {
    const response = await page.goto("/sprints", { waitUntil: "networkidle" });
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);
  });

  test("/sprints redirects unauthenticated to sign-in", async ({ page }) => {
    await page.goto("/sprints", { waitUntil: "networkidle" });
    const finalUrl = page.url();
    const isProtected =
      finalUrl.includes("sign-in") ||
      finalUrl.includes("clerk.") ||
      !finalUrl.endsWith("/sprints");
    expect(isProtected).toBeTruthy();
  });

  test("/sprints/nonexistent does not return 500", async ({ page }) => {
    const response = await page.goto("/sprints/nonexistent-id", {
      waitUntil: "networkidle",
    });
    const status = response?.status() ?? 0;
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);
  });

  test("/s/[token] (public sprint) returns 200 or 404 for unknown token", async ({ page }) => {
    const response = await page.goto("/s/nonexistent-token", {
      waitUntil: "networkidle",
    });
    const status = response?.status() ?? 0;
    // Must not be 500
    expect(status).not.toBe(500);
    expect(status).not.toBe(503);
    // Should be 200 (shows not found UI) or 404
    expect([200, 404]).toContain(status);
  });
});
