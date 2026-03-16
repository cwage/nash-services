const { test, expect } = require("@playwright/test");

test.describe("Dataset dropdown reopen behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("dropdown opens on focus", async ({ page }) => {
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);
  });

  test("dropdown closes on blur", async ({ page }) => {
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);

    // Blur by pressing Tab to move focus away
    await page.keyboard.press("Tab");
    await expect(page.locator("#service-dropdown")).not.toHaveClass(/open/, { timeout: 1000 });
  });

  test("dropdown reopens when clicking back into search field", async ({ page }) => {
    // Open
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);

    // Blur via Tab
    await page.keyboard.press("Tab");
    await expect(page.locator("#service-dropdown")).not.toHaveClass(/open/, { timeout: 1000 });

    // Click back in — should reopen
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/, { timeout: 1000 });

    // Verify options are populated
    const optionCount = await page.evaluate(() =>
      document.querySelectorAll("#service-dropdown .service-option").length
    );
    expect(optionCount).toBeGreaterThan(0);
  });

  test("rapid focus/blur/focus still opens dropdown", async ({ page }) => {
    // Quick focus-blur-focus cycle
    await page.click("#service-search");
    await page.keyboard.press("Tab");
    await page.click("#service-search");

    // Should be open after the rapid cycle
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/, { timeout: 1000 });
  });
});
