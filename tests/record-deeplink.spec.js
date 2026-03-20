const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

test.describe("Record deep-linking", () => {
  test("clicking a sidebar result adds record param to URL", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForSelector(".result-item", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Click first result and wait for popup to appear
    await page.click(".result-item");
    await page.waitForSelector(".leaflet-popup-content", { timeout: 5000 });
    await page.waitForTimeout(500);

    // URL should now contain record= param (an index number)
    const url = new URL(page.url());
    const recordParam = url.searchParams.get("record");
    expect(recordParam).toBeTruthy();
    expect(Number.isFinite(Number.parseInt(recordParam, 10))).toBe(true);
    console.log(`Record index in URL: ${recordParam}`);
  });

  test("closing popup removes record param from URL", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForSelector(".result-item", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Click to open popup
    await page.click(".result-item");
    await page.waitForSelector(".leaflet-popup-content", { timeout: 5000 });
    await page.waitForTimeout(500);

    // Verify record param present
    let url = new URL(page.url());
    expect(url.searchParams.get("record")).toBeTruthy();

    // Close popup via X button
    await page.click(".leaflet-popup-close-button");
    await page.waitForTimeout(500);

    // Record param should be gone
    url = new URL(page.url());
    expect(url.searchParams.get("record")).toBeNull();
  });

  test("loading a URL with record param opens that record popup", async ({ page }) => {
    test.setTimeout(60000);

    // Use record index 0 (first result) — always valid if there are results
    await page.goto("/?service=Metro_Nashville_Police_Department_Active_Dispatch_Table_view&address=1000+Broadway,+Nashville,+TN&radius=5&record=0");
    await page.waitForSelector(".result-item", { timeout: 30000 });

    // Wait for the popup to appear (restore logic)
    await page.waitForSelector(".leaflet-popup-content", { timeout: 10000 });
    const popup = await page.$(".leaflet-popup-content");
    expect(popup).toBeTruthy();
  });

  test("bogus record param does not crash", async ({ page }) => {
    test.setTimeout(60000);
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));

    await page.goto("/?service=Metro_Nashville_Police_Department_Active_Dispatch_Table_view&address=1000+Broadway,+Nashville,+TN&radius=5&record=999999");
    await page.waitForSelector(".result-item", { timeout: 30000 });
    await page.waitForTimeout(2000);

    // No popup should be open (index out of range)
    const popup = await page.$(".leaflet-popup-content");
    expect(popup).toBeNull();

    // No JS errors
    expect(errors).toHaveLength(0);
  });

  test("unmapped record modal sets record param in URL", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForSelector(".result-item", { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Find an unmapped item (has the pin badge)
    const unmappedItem = await page.$(".result-item:has(.no-pin-badge)");
    if (!unmappedItem) {
      test.skip();
      return;
    }

    await unmappedItem.click();
    await page.waitForSelector(".record-modal-overlay.open", { timeout: 3000 });
    await page.waitForTimeout(300);

    // URL should have record param
    const url = new URL(page.url());
    const recordParam = url.searchParams.get("record");
    expect(recordParam).toBeTruthy();
    console.log(`Unmapped record index in URL: ${recordParam}`);

    // Close the modal
    await page.click("#record-modal-close");
    await page.waitForTimeout(300);

    // Record param should be cleared
    const url2 = new URL(page.url());
    expect(url2.searchParams.get("record")).toBeNull();
  });
});
