const { test, expect } = require("@playwright/test");

test("switching from bombing preset to normal dataset clears sector circles", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");

  await page.waitForFunction(() => {
    const sel = document.getElementById("service-select");
    return sel && sel.options.length > 1;
  }, { timeout: 15000 });

  // Click bombing preset
  await page.click(".featured-item");
  await page.waitForSelector(".sector-summary", { timeout: 30000 });

  // Count SVG paths (circles render as paths in Leaflet)
  const pathsBefore = await page.evaluate(() =>
    document.querySelectorAll(".leaflet-overlay-pane path").length
  );
  console.log("Paths after bombing preset:", pathsBefore);
  expect(pathsBefore).toBeGreaterThan(5); // radius + sectors

  // Now switch to a different, non-sector dataset
  await page.selectOption("#service-select", "Building_Permits_Issued_2");
  await page.fill("#address-input", "1000 Broadway, Nashville, TN");
  await page.fill("#radius-input", "1");
  await page.click("#search-btn");

  await page.waitForFunction(() => {
    const status = document.getElementById("status").textContent;
    return status && !status.includes("Searching") && status.includes("result");
  }, { timeout: 30000 });

  // Count paths after — should be fewer (no sector circles)
  const pathsAfter = await page.evaluate(() =>
    document.querySelectorAll(".leaflet-overlay-pane path").length
  );
  const hasSectorSummary = await page.evaluate(() =>
    !!document.querySelector(".sector-summary")
  );
  console.log("Paths after building permits:", pathsAfter);
  console.log("Has sector summary:", hasSectorSummary);

  await page.screenshot({ path: "/tests/clear-map-after-switch.png", fullPage: true });

  expect(hasSectorSummary).toBe(false);
  expect(pathsAfter).toBeLessThan(pathsBefore);
});
