const { test, expect } = require("@playwright/test");

test.describe("Core functionality", () => {
  test("services load and dropdown populates", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    const optionCount = await page.evaluate(() =>
      document.getElementById("service-select").options.length
    );
    console.log(`Services loaded: ${optionCount - 1}`); // minus placeholder
    expect(optionCount).toBeGreaterThan(50);
  });

  test("MNPD active dispatch search works (polled/cached service)", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await page.selectOption("#service-select",
      "Metro_Nashville_Police_Department_Active_Dispatch_Table_view");
    await page.fill("#address-input", "211 Broadway, Nashville, TN");
    await page.fill("#radius-input", "5");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status && !status.includes("Searching");
    }, { timeout: 30000 });

    const state = await page.evaluate(() => ({
      status: document.getElementById("status").textContent,
      resultItems: document.querySelectorAll(".result-item").length,
      hasDateRange: document.getElementById("date-range").style.display !== "none",
    }));

    console.log("MNPD dispatch:", state.status);
    expect(state.status).toContain("result(s) found");
    // Polled services may still show date range (they have date fields)

    await page.screenshot({ path: "/tests/core-mnpd-dispatch.png", fullPage: true });
  });

  test("non-polled service with geometry works (building permits)", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await page.selectOption("#service-select", "Building_Permits_Issued_2");
    await page.fill("#address-input", "1000 Broadway, Nashville, TN");
    await page.fill("#radius-input", "1");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status && !status.includes("Searching");
    }, { timeout: 30000 });

    const state = await page.evaluate(() => ({
      status: document.getElementById("status").textContent,
      resultItems: document.querySelectorAll(".result-item").length,
    }));

    console.log("Building permits:", state.status);
    expect(state.status).toContain("result(s) found");

    await page.screenshot({ path: "/tests/core-building-permits.png", fullPage: true });
  });

  test("URL state persists and reloads correctly", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    await page.selectOption("#service-select", "Building_Permits_Issued_2");
    await page.fill("#address-input", "500 Church St");
    await page.fill("#radius-input", "1");
    await page.click("#search-btn");

    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status && !status.includes("Searching");
    }, { timeout: 30000 });

    // Check URL was updated
    const url = page.url();
    console.log("URL after search:", url);
    expect(url).toContain("service=Building_Permits_Issued_2");
    expect(url).toContain("address=500");

    // Reload and verify it auto-searches
    await page.reload();
    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return status && !status.includes("Searching") && status.includes("result");
    }, { timeout: 30000 });

    const stateAfterReload = await page.evaluate(() => ({
      service: document.getElementById("service-select").value,
      address: document.getElementById("address-input").value,
      status: document.getElementById("status").textContent,
    }));

    console.log("After reload:", stateAfterReload);
    expect(stateAfterReload.service).toBe("Building_Permits_Issued_2");
    expect(stateAfterReload.address).toContain("500 Church St");
    expect(stateAfterReload.status).toContain("result(s) found");
  });

  test("health endpoint includes cache stats", async ({ page }) => {
    const resp = await page.goto("/health");
    const data = JSON.parse(await resp.text());
    console.log("Health:", JSON.stringify(data, null, 2));
    expect(data.status).toBe("ok");
    expect(data.cache).toBeDefined();
    expect(data.cache.total).toBeGreaterThanOrEqual(0);
  });
});
