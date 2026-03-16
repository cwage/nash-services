const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

test.describe("Address field required highlight", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("address field is not highlighted initially", async ({ page }) => {
    const hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(false);
  });

  test("address field highlights red when service selected but address empty", async ({ page }) => {
    await pickService(page, "Building_Permits_Issued_2");

    const hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(true);
  });

  test("highlight clears when address is entered", async ({ page }) => {
    await pickService(page, "Building_Permits_Issued_2");

    // Should be highlighted
    let hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(true);

    // Type an address
    await page.fill("#address-input", "1000 Broadway");

    hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(false);
  });

  test("highlight reappears when address is cleared", async ({ page }) => {
    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway");

    // Not highlighted with address
    let hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(false);

    // Clear address
    await page.fill("#address-input", "");

    hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(true);
  });

  test("no highlight when no service is selected", async ({ page }) => {
    // Just type in address with no service
    await page.fill("#address-input", "1000 Broadway");

    const hasClass = await page.evaluate(() =>
      document.getElementById("address-input").classList.contains("input-required")
    );
    expect(hasClass).toBe(false);
  });
});
