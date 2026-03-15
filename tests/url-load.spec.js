const { test, expect } = require("@playwright/test");

test("load bombing URL and capture what user sees", async ({ page }) => {
  test.setTimeout(60000);

  // Load the exact URL the user would use
  await page.goto("/?service=Metro_Nashville_Police_Department_Calls_for_Service_2020&address=166+2nd+Ave+N%2C+Nashville%2C+TN&radius=2&from=2020-12-25T12%3A00&to=2020-12-25T14%3A00");

  // Wait for search to complete
  await page.waitForFunction(() => {
    const status = document.getElementById("status").textContent;
    return status && !status.includes("Searching") && !status.includes("Loading");
  }, { timeout: 30000 });

  await page.waitForTimeout(2000);

  // Capture what's on screen
  const state = await page.evaluate(() => {
    const fromVal = document.getElementById("date-from").value;
    const toVal = document.getElementById("date-to").value;
    const status = document.getElementById("status").textContent;
    const serviceVal = document.getElementById("service-select").value;
    const addressVal = document.getElementById("address-input").value;
    const dateRangeDisplay = document.getElementById("date-range").style.display;

    // Check for sector circles on the map (Leaflet circles)
    const mapPane = document.querySelector(".leaflet-overlay-pane");
    const svgPaths = mapPane ? mapPane.querySelectorAll("path").length : 0;
    const circles = mapPane ? mapPane.querySelectorAll("circle").length : 0;

    // Check sidebar
    const sectorSummary = document.querySelector(".sector-summary");
    const sectorRows = document.querySelectorAll(".sector-row");
    const sectors = {};
    sectorRows.forEach(r => {
      const name = r.querySelector(".sector-name")?.textContent.trim();
      const count = parseInt(r.querySelector(".sector-count")?.textContent.trim());
      if (name) sectors[name] = count;
    });

    const resultItems = document.querySelectorAll(".result-item").length;

    return {
      fromVal, toVal, status, serviceVal, addressVal,
      dateRangeDisplay, svgPaths, circles,
      hasSectorSummary: !!sectorSummary,
      sectorCount: sectorRows.length,
      sectors,
      resultItems,
    };
  });

  console.log("Page state:", JSON.stringify(state, null, 2));
  await page.screenshot({ path: "/tests/url-load-result.png", fullPage: true });

  // Verify the search actually ran with correct params
  expect(state.serviceVal).toBe("Metro_Nashville_Police_Department_Calls_for_Service_2020");
  expect(state.addressVal).toContain("166 2nd Ave N");
  expect(state.status).toContain("without location");
  expect(state.hasSectorSummary).toBe(true);

  // Check dates survived the load
  console.log("Dates:", state.fromVal, "to", state.toVal);
});
