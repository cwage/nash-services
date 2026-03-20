const { test, expect } = require("@playwright/test");

test.describe("About modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("about button is visible in sidebar footer", async ({ page }) => {
    const btn = page.locator("#about-open");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText("What is this?");
  });

  test("bug report button is still visible", async ({ page }) => {
    const btn = page.locator("#bug-report-open");
    await expect(btn).toBeVisible();
  });

  test("modal opens on button click", async ({ page }) => {
    await page.click("#about-open");
    const overlay = page.locator("#about-modal-overlay");
    await expect(overlay).toHaveClass(/open/);
    await expect(page.locator("#about-modal-title")).toHaveText("Nash Services");
  });

  test("modal contains key content", async ({ page }) => {
    await page.click("#about-open");
    const content = page.locator(".about-content");
    await expect(content).toContainText("Nashville Open Data");
    await expect(content).toContainText("Live");
    await expect(content).toContainText("Recent");
    await expect(content).toContainText("Older");
    await expect(content).toContainText("Chris Wage");
    await expect(content).toContainText("GitHub");
  });

  test("modal closes via Close button", async ({ page }) => {
    await page.click("#about-open");
    const overlay = page.locator("#about-modal-overlay");
    await expect(overlay).toHaveClass(/open/);

    await page.click("#about-close");
    await expect(overlay).not.toHaveClass(/open/);
  });

  test("modal closes via Escape key", async ({ page }) => {
    await page.click("#about-open");
    const overlay = page.locator("#about-modal-overlay");
    await expect(overlay).toHaveClass(/open/);

    await page.keyboard.press("Escape");
    await expect(overlay).not.toHaveClass(/open/);
  });

  test("modal closes via backdrop click", async ({ page }) => {
    await page.click("#about-open");
    const overlay = page.locator("#about-modal-overlay");
    await expect(overlay).toHaveClass(/open/);

    // Click the overlay itself (top-left corner, outside the modal)
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).not.toHaveClass(/open/);
  });

});
