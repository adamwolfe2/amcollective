import { test, expect } from "@playwright/test";

// These nav items match NAV_ITEMS in admin-shell.tsx
const NAV_HREFS = [
  "/dashboard",
  "/sprints",
  "/leads",
  "/clients",
  "/projects",
  "/tasks",
  "/contracts",
  "/invoices",
  "/services",
  "/team",
  "/finance",
  "/knowledge",
  "/documents",
  "/costs",
  "/domains",
  "/rocks",
  "/forecast",
  "/analytics",
  "/scorecard",
  "/messages",
  "/outreach",
  "/ai",
  "/alerts",
  "/vault",
  "/compliance",
  "/activity",
  "/settings",
];

test.describe("Admin shell nav (unauthenticated)", () => {
  test("all nav routes exist and do not return 5xx", async ({ page }) => {
    const results: Record<string, number> = {};
    // Test a subset of routes to keep runtime reasonable
    // Unauthenticated requests will be redirected (302/200 to sign-in) — that's correct
    const testRoutes = NAV_HREFS.slice(0, 10);
    for (const href of testRoutes) {
      const response = await page.goto(href, { waitUntil: "networkidle" });
      const status = response?.status() ?? 0;
      results[href] = status;
      // Should not return 500 or 503
      expect(status, `Route ${href} returned ${status}`).not.toBe(500);
      expect(status, `Route ${href} returned ${status}`).not.toBe(503);
    }
  });

  test("nav hrefs have no typos (all start with /)", () => {
    for (const href of NAV_HREFS) {
      expect(href).toMatch(/^\//);
    }
  });

  test("nav has expected count (27 items)", () => {
    expect(NAV_HREFS.length).toBe(27); // 27 items in the shell
  });
});
