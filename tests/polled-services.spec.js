const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

const POLLED_SERVICES = [
  { name: "Metro_Nashville_Police_Department_Active_Dispatch_Table_view", desc: "MNPD active dispatch" },
  { name: "Nashville_Fire_Department_Active_Incidents_view", desc: "NFD active incidents" },
];

test.describe("Polled/cached services", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  for (const svc of POLLED_SERVICES) {
    test(`${svc.desc} returns cached results without date picker`, async ({ page }) => {
      test.setTimeout(60000);

      await pickService(page, svc.name);
      // Wait for updateDateRange to complete
      await page.waitForTimeout(2000);

      // Date picker should NOT be visible for polled services
      const dateRangeDisplay = await page.evaluate(() =>
        document.getElementById("date-range").style.display
      );
      expect(dateRangeDisplay).toBe("none");

      // Search
      await page.fill("#address-input", "1001 Broadway, Nashville, TN");
      await page.fill("#radius-input", "10");
      await page.click("#search-btn");

      await page.waitForFunction(() => {
        const status = document.getElementById("status").textContent;
        return status && !status.includes("Searching");
      }, { timeout: 30000 });

      // Should have results from cache
      const state = await page.evaluate(() => ({
        status: document.getElementById("status").textContent,
        resultItems: document.querySelectorAll(".result-item").length,
      }));

      console.log(`${svc.desc}: ${state.status}`);
      expect(state.status).toContain("result(s) found");
      expect(state.resultItems).toBeGreaterThan(0);

      // URL should NOT have from/to params
      const url = page.url();
      expect(url).not.toContain("from=");
      expect(url).not.toContain("to=");
    });
  }

  test("loading polled service via URL without dates returns results", async ({ page }) => {
    test.setTimeout(60000);

    // Load directly via URL — the way a shared link works
    await page.goto("/?service=Metro_Nashville_Police_Department_Active_Dispatch_Table_view&address=1001+Broadway&radius=10");

    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status && !status.includes("Searching") && !status.includes("Loading");
    }, { timeout: 30000 });

    const state = await page.evaluate(() => ({
      status: document.getElementById("status").textContent,
      dateRangeVisible: document.getElementById("date-range").style.display !== "none",
      resultItems: document.querySelectorAll(".result-item").length,
    }));

    console.log(`URL load: ${state.status}`);
    expect(state.dateRangeVisible).toBe(false);
    expect(state.status).toContain("result(s) found");
    expect(state.resultItems).toBeGreaterThan(0);
  });
});
