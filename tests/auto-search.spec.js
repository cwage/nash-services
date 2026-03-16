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

    // Change radius — triggers auto-search via 'change' event
    await page.fill("#radius-input", "5");
    // Dispatch change event explicitly (blur may not fire reliably in CI)
    await page.evaluate(() => {
      document.getElementById("radius-input").dispatchEvent(new Event("change"));
    });

    // Wait for the "Searching..." loading state to appear then resolve
    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s.includes("Searching");
    }, { timeout: 5000 });
    await page.waitForFunction(() => {
      const base = document.getElementById("status").dataset.baseStatus || "";
      return base.includes("result(s) found");
    }, { timeout: 30000 });

    const url = page.url();
    console.log("URL after radius change:", url);
    expect(url).toContain("radius=5");
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
