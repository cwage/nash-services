const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

test.describe("Auto-search on input changes", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("switching dataset with address filled triggers search", async ({ page }) => {
    // Do an initial search
    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.click("#search-btn");
    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("result(s) found");
    }, { timeout: 30000 });

    const firstStatus = await page.evaluate(() =>
      document.getElementById("status").textContent
    );

    // Now switch dataset via combobox — should auto-search
    await page.fill("#service-search", "traffic crash");
    await page.locator("#service-dropdown .service-option").first().click();

    // Wait for new search to complete
    await page.waitForFunction((prev) => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("result(s) found") && s !== prev;
    }, firstStatus, { timeout: 30000 });

    const newStatus = await page.evaluate(() =>
      document.getElementById("status").textContent
    );
    console.log("After dataset switch:", newStatus);
    expect(newStatus).toContain("result(s) found");
  });

  test("changing radius auto-searches when address is filled", async ({ page }) => {
    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "1");
    await page.click("#search-btn");
    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("result(s) found");
    }, { timeout: 30000 });

    const countAtRadius1 = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );

    // Change radius via the number input — triggers 'change' on blur
    await page.fill("#radius-input", "5");
    await page.locator("#radius-input").blur();

    // Wait for new results
    await page.waitForFunction((prevCount) => {
      const items = document.querySelectorAll(".result-item").length;
      const status = document.getElementById("status").textContent;
      return status.includes("result(s) found") && items !== prevCount;
    }, countAtRadius1, { timeout: 30000 });

    const countAtRadius5 = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );

    console.log(`Radius 1mi: ${countAtRadius1}, Radius 5mi: ${countAtRadius5}`);
    expect(countAtRadius5).toBeGreaterThan(countAtRadius1);
  });

  test("switching dataset without address does NOT trigger search", async ({ page }) => {
    // Select a dataset with no address
    await page.fill("#service-search", "building permit");
    await page.locator("#service-dropdown .service-option").first().click();

    // Wait a moment to confirm nothing happened
    await page.waitForTimeout(500);

    const status = await page.evaluate(() =>
      document.getElementById("status").textContent
    );
    expect(status).not.toContain("result(s) found");
    expect(status).not.toContain("Searching");
  });
});
