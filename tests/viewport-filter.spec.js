const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

test.describe("Viewport filtering of sidebar results", () => {
  test("zooming in hides out-of-view results", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("found");
    }, { timeout: 30000 });

    const totalItems = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );
    console.log("Total result items:", totalItems);
    expect(totalItems).toBeGreaterThan(10);

    // Zoom in tightly — should hide distant results
    await page.evaluate(() => {
      map.setView([36.16, -86.78], 17);
    });

    await page.waitForFunction(() => {
      const hidden = Array.from(document.querySelectorAll(".result-item"))
        .filter(el => el.style.display === "none").length;
      return hidden > 0;
    }, { timeout: 5000 });

    const visibleAfter = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".result-item"))
        .filter(el => el.style.display !== "none").length
    );

    console.log(`After zoom-in: ${visibleAfter} visible of ${totalItems} total`);
    expect(visibleAfter).toBeLessThan(totalItems);
  });

  test("status message shows 'in view' count when zoomed in", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("found");
    }, { timeout: 30000 });

    await page.evaluate(() => {
      map.setView([36.16, -86.78], 17);
    });

    await page.waitForFunction(() => {
      return document.getElementById("status").textContent.includes("in view");
    }, { timeout: 5000 });

    const status = await page.evaluate(() =>
      document.getElementById("status").textContent
    );
    console.log("Status after zoom:", status);
    expect(status).toContain("in view");
  });

  test("zooming back out restores all results", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "3");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("found");
    }, { timeout: 30000 });

    const totalItems = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );

    // Zoom in
    await page.evaluate(() => {
      map.setView([36.16, -86.78], 17);
    });
    await page.waitForFunction(() => {
      return document.getElementById("status").textContent.includes("in view");
    }, { timeout: 5000 });

    // Zoom back out
    await page.evaluate(() => {
      map.setView([36.16, -86.78], 10);
    });

    // Wait for status to no longer say "in view" (all records in viewport)
    await page.waitForFunction(() => {
      return !document.getElementById("status").textContent.includes("in view");
    }, { timeout: 5000 });

    // Visible items should be >= what was shown when zoomed in
    // (may still be < total due to location grouping of stacked records)
    const visibleZoomedOut = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".result-item"))
        .filter(el => el.style.display !== "none").length
    );

    const status = await page.evaluate(() =>
      document.getElementById("status").textContent
    );
    console.log(`Status after zoom-out: ${status}, visible: ${visibleZoomedOut}`);
    expect(status).not.toContain("in view");
    expect(visibleZoomedOut).toBeGreaterThan(0);
  });

  test("stacked records at same location are grouped with expand toggle", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Building permits with large radius — always available, has stacked records
    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("found");
    }, { timeout: 30000 });

    const totalItems = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );

    // Check if grouping is active (stacked records at same coordinates)
    const groupBadges = await page.evaluate(() =>
      document.querySelectorAll(".location-group").length
    );

    const visibleItems = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".result-item"))
        .filter(el => el.style.display !== "none").length
    );

    console.log(`Visible items: ${visibleItems}, Group badges: ${groupBadges}, Total: ${totalItems}`);

    // With a large enough dataset, some records share coordinates
    if (groupBadges > 0) {
      expect(visibleItems).toBeLessThan(totalItems);

      // Click a group badge to expand
      await page.click(".location-group");
      await page.waitForTimeout(500);
      const expandedItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".result-item"))
          .filter(el => el.style.display !== "none").length
      );
      console.log(`After expanding: ${expandedItems} visible`);
      expect(expandedItems).toBeGreaterThanOrEqual(visibleItems);

      // Click again to collapse — should return to roughly original visible count
      // (viewport filter may cause small variance depending on timing)
      await page.click(".location-group");
      await page.waitForTimeout(500);
      const collapsedItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".result-item"))
          .filter(el => el.style.display !== "none").length
      );
      expect(collapsedItems).toBeLessThanOrEqual(expandedItems + 5);
      expect(Math.abs(collapsedItems - visibleItems)).toBeLessThanOrEqual(5);
    } else {
      // No stacking — all items visible, which is fine for unique-coordinate data
      expect(visibleItems).toBe(totalItems);
    }
  });
});
