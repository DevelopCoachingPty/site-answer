import { test, expect } from "@playwright/test";

// These tests require a running app with an authenticated session.
// They serve as a scaffold — fill in auth setup with storageState
// or programmatic login when Supabase test credentials are available.

test.describe("Dashboard pages load", () => {
  test.skip(true, "Requires authenticated session — scaffold only");

  test("calls page loads", async ({ page }) => {
    await page.goto("/dashboard/calls");
    await expect(page.getByText("Call Log")).toBeVisible();
  });

  test("knowledge base page loads", async ({ page }) => {
    await page.goto("/dashboard/knowledge-base");
    await expect(page.getByText("Knowledge Base")).toBeVisible();
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("analytics page loads", async ({ page }) => {
    await page.goto("/dashboard/analytics");
    await expect(page.getByText("Analytics")).toBeVisible();
  });

  test("notifications page loads", async ({ page }) => {
    await page.goto("/dashboard/notifications");
    await expect(page.getByText("Notifications")).toBeVisible();
  });
});
