const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

test.describe("Marker and cluster color consistency", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("non-polled service: markers and clusters both use red", async ({ page }) => {
    await pickService(page, "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("results found");
    }, { timeout: 30000 });

    // Check individual marker colors — should be red (#e74c3c)
    const markerColors = await page.evaluate(() => {
      const paths = document.querySelectorAll(".leaflet-interactive");
      const colors = new Set();
      for (const p of paths) {
        const fill = p.getAttribute("fill");
        if (fill && fill !== "#4a9eff") colors.add(fill); // skip radius circle
      }
      return Array.from(colors);
    });

    console.log("Non-polled marker colors:", markerColors);
    // Should contain red, NOT blue
    expect(markerColors.length).toBeGreaterThan(0);
    expect(markerColors.every(c => c === "#e74c3c")).toBe(true);

    // Check cluster colors if any clusters exist
    const clusterColors = await page.evaluate(() => {
      const clusters = document.querySelectorAll(".marker-cluster-custom div div");
      return Array.from(clusters).map(el => el.style.background || el.style.backgroundColor);
    });

    if (clusterColors.length > 0) {
      console.log("Non-polled cluster colors:", clusterColors);
      // Clusters should use red, not blue
      for (const c of clusterColors) {
        expect(c).toContain("231");  // rgba(231,76,60,...) = red
        expect(c).not.toContain("74, 158");  // not blue
      }
    }
  });

  test("polled service (cached): clusters use status-based colors", async ({ page }) => {
    await pickService(page, "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "1001 Broadway, Nashville, TN");
    await page.fill("#radius-input", "10");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const s = document.getElementById("status").textContent;
      return s && s.includes("results found");
    }, { timeout: 30000 });

    // Individual markers should use status colors (red/orange/gray)
    const markerColors = await page.evaluate(() => {
      const paths = document.querySelectorAll(".leaflet-interactive");
      const colors = new Set();
      for (const p of paths) {
        const fill = p.getAttribute("fill");
        if (fill && fill !== "#4a9eff") colors.add(fill); // skip radius circle
      }
      return Array.from(colors);
    });

    console.log("Polled marker colors:", markerColors);
    // Should contain status colors, NOT blue
    const statusColors = new Set(["#e74c3c", "#f39c12", "#95a5a6"]);
    for (const c of markerColors) {
      expect(statusColors.has(c)).toBe(true);
    }

    // Clusters should NOT be blue
    const clusterColors = await page.evaluate(() => {
      const clusters = document.querySelectorAll(".marker-cluster-custom div div");
      return Array.from(clusters).map(el => el.style.background || el.style.backgroundColor);
    });

    if (clusterColors.length > 0) {
      console.log("Polled cluster colors:", clusterColors);
      for (const c of clusterColors) {
        expect(c).not.toContain("74, 158");  // not blue
      }
    }
  });
});
