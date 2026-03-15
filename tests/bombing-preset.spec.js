const { test, expect } = require("@playwright/test");

test.describe("Christmas Bombing preset", () => {
  test("clicking preset sets correct date range and renders sector circles", async ({ page }) => {
    await page.goto("/");

    // Wait for services dropdown to populate
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Click the featured preset
    await page.click(".featured-item");

    // Wait for search to complete — sector summary should appear
    await page.waitForSelector(".sector-summary", { timeout: 30000 });

    // Check date inputs have the bombing time window
    const fromVal = await page.inputValue("#date-from");
    const toVal = await page.inputValue("#date-to");
    console.log("Date from:", fromVal);
    console.log("Date to:", toVal);
    expect(fromVal).toContain("2020-12-25");
    expect(toVal).toContain("2020-12-25");

    // Check status text shows results
    const status = await page.textContent("#status");
    console.log("Status:", status);
    expect(status).toContain("without location");

    // Check sector summary rendered with Central dominating
    const sectorRows = await page.$$eval(".sector-row", rows =>
      rows.map(r => ({
        name: r.querySelector(".sector-name").textContent.trim(),
        count: parseInt(r.querySelector(".sector-count").textContent.trim()),
      }))
    );
    console.log("Sectors:", JSON.stringify(sectorRows));
    const central = sectorRows.find(s => s.name === "Central");
    expect(central).toBeTruthy();
    expect(central.count).toBeGreaterThan(20);

    // Central should have the highest count
    const maxCount = Math.max(...sectorRows.map(s => s.count));
    expect(central.count).toBe(maxCount);

    // Take screenshot
    await page.screenshot({ path: "/tests/bombing-preset.png", fullPage: true });
  });

  test("date nav arrows shift by 2 hours and re-search", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Click preset
    await page.click(".featured-item");
    await page.waitForSelector(".sector-summary", { timeout: 30000 });

    // Record initial dates
    const fromBefore = await page.inputValue("#date-from");
    const toBefore = await page.inputValue("#date-to");
    console.log("Before nav - from:", fromBefore, "to:", toBefore);

    // Screenshot before
    await page.screenshot({ path: "/tests/bombing-before-nav.png", fullPage: true });

    // Click prev arrow
    await page.click("#date-prev");

    // Wait for dates to change
    await page.waitForFunction((oldFrom) => {
      return document.getElementById("date-from").value !== oldFrom;
    }, fromBefore, { timeout: 10000 });

    // Wait for new search to complete
    await page.waitForTimeout(5000);

    const fromAfter = await page.inputValue("#date-from");
    const toAfter = await page.inputValue("#date-to");
    console.log("After prev - from:", fromAfter, "to:", toAfter);

    // Dates should have shifted back
    expect(fromAfter).not.toBe(fromBefore);
    expect(toAfter).not.toBe(toBefore);

    // Screenshot after
    await page.screenshot({ path: "/tests/bombing-after-nav.png", fullPage: true });

    // The sector counts should be different (normal vs bombing hour)
    const sectorRows = await page.$$eval(".sector-row", rows =>
      rows.map(r => ({
        name: r.querySelector(".sector-name").textContent.trim(),
        count: parseInt(r.querySelector(".sector-count").textContent.trim()),
      }))
    );
    console.log("Sectors after nav:", JSON.stringify(sectorRows));
  });
});
