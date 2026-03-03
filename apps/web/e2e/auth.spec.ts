import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads with form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toBeVisible();
  });

  test("register page loads with form", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign up|register|create/i })).toBeVisible();
  });

  test("unauthenticated user redirected from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login**");
    await expect(page).toHaveURL(/\/login/);
  });
});
