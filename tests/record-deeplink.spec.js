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

    // URL should now contain record= param
    const url = new URL(page.url());
    const recordId = url.searchParams.get("record");
    expect(recordId).toBeTruthy();
    console.log(`Record ID in URL: ${recordId}`);
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

    // First, do a search to find a valid record ID via the API
    const resp = await page.request.get("/nearby/Metro_Nashville_Police_Department_Active_Dispatch_Table_view?address=1000+Broadway,+Nashville,+TN&radius=5&max=10");
    const data = await resp.json();
    const mappedRecord = data.records.find(r => r._lat != null && r._lng != null);
    expect(mappedRecord).toBeTruthy();
    const recordId = String(mappedRecord.ObjectId || mappedRecord.OBJECTID || mappedRecord.FID || mappedRecord.GlobalID);
    expect(recordId).toBeTruthy();
    console.log(`Using record ID: ${recordId}`);

    // Load the deep-link URL
    await page.goto(`/?service=Metro_Nashville_Police_Department_Active_Dispatch_Table_view&address=1000+Broadway,+Nashville,+TN&radius=5&record=${recordId}`);
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

    // No popup should be open (bogus ID doesn't match)
    const popup = await page.$(".leaflet-popup-content");
    expect(popup).toBeNull();

    // No JS errors
    expect(errors).toHaveLength(0);
  });
});
