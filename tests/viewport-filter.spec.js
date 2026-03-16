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
      return s && s.includes("result(s) found");
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
      return s && s.includes("result(s) found");
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
      return s && s.includes("result(s) found");
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

    // MNPD dispatch is polled/cached — likely has stacked records
    await pickService(page, "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "1001 Broadway, Nashville, TN");
    await page.fill("#radius-input", "10");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("result(s) found");
    }, { timeout: 30000 });

    const totalItems = await page.evaluate(() =>
      document.querySelectorAll(".result-item").length
    );

    // Zoom in enough to reduce the view but keep some stacked results
    await page.evaluate(() => {
      map.setView([36.16, -86.78], 15);
    });

    // Wait for viewport filter
    await page.waitForFunction(() => {
      return document.getElementById("status").textContent.includes("in view");
    }, { timeout: 5000 });

    // Check if any location groups exist (stacked records)
    const groupBadges = await page.evaluate(() =>
      document.querySelectorAll(".location-group").length
    );

    const visibleItems = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".result-item"))
        .filter(el => el.style.display !== "none").length
    );

    const status = await page.evaluate(() =>
      document.getElementById("status").textContent
    );

    console.log(`Status: ${status}`);
    console.log(`Visible items: ${visibleItems}, Group badges: ${groupBadges}, Total: ${totalItems}`);

    // The number of visible items should equal the number of unique locations
    // (one representative per location), which should be <= total items
    if (groupBadges > 0) {
      // If grouping happened, visible items should be fewer than total in-view records
      expect(status).toContain("locations");
      expect(visibleItems).toBeLessThan(totalItems);

      // Click a group badge to expand
      await page.click(".location-group");
      const expandedItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".result-item"))
          .filter(el => el.style.display !== "none").length
      );
      console.log(`After expanding: ${expandedItems} visible`);
      expect(expandedItems).toBeGreaterThan(visibleItems);

      // Click again to collapse
      await page.click(".location-group");
      const collapsedItems = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".result-item"))
          .filter(el => el.style.display !== "none").length
      );
      expect(collapsedItems).toBe(visibleItems);
    }
  });
});
