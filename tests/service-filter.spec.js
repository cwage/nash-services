const { test, expect } = require("@playwright/test");

test.describe("Dataset search filter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("search input exists and starts empty", async ({ page }) => {
    const search = page.locator("#service-search");
    await expect(search).toBeVisible();
    await expect(search).toHaveValue("");
    await expect(search).toHaveAttribute("placeholder", "Search datasets...");
  });

  test("focusing search input opens dropdown with all services", async ({ page }) => {
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);

    const optionCount = await page.evaluate(() =>
      document.querySelectorAll("#service-dropdown .service-option").length
    );
    console.log(`Dropdown options on focus: ${optionCount}`);
    expect(optionCount).toBeGreaterThan(50);
  });

  test("typing a query filters dropdown options", async ({ page }) => {
    await page.click("#service-search");

    const fullCount = await page.evaluate(() =>
      document.querySelectorAll("#service-dropdown .service-option").length
    );

    await page.fill("#service-search", "police");

    const filteredCount = await page.evaluate(() =>
      document.querySelectorAll("#service-dropdown .service-option").length
    );

    console.log(`Full: ${fullCount}, Filtered for "police": ${filteredCount}`);
    expect(filteredCount).toBeLessThan(fullCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test("filter matches on category", async ({ page }) => {
    await page.fill("#service-search", "traffic");

    const options = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#service-dropdown .service-option"))
        .map(o => o.textContent)
    );

    console.log("Traffic filter results:", options);
    expect(options.length).toBeGreaterThan(0);
  });

  test("clicking an option selects the service", async ({ page }) => {
    await page.fill("#service-search", "building permit");

    // Click the first matching option
    const firstOption = page.locator("#service-dropdown .service-option").first();
    const optionLabel = await firstOption.locator(".service-option-label").textContent();
    const optionValue = await firstOption.getAttribute("data-value");
    await firstOption.click();

    // Should update the hidden select
    const selectedValue = await page.evaluate(() =>
      document.getElementById("service-select").value
    );
    expect(selectedValue).toBe(optionValue);

    // Should show selected label
    const label = await page.evaluate(() =>
      document.getElementById("service-selected").querySelector("span").textContent
    );
    expect(label).toBe(optionLabel);

    // Dropdown should close
    await expect(page.locator("#service-dropdown")).not.toHaveClass(/open/);

    // Search input should be cleared
    await expect(page.locator("#service-search")).toHaveValue("");

    console.log(`Selected: ${optionLabel} (${optionValue})`);
  });

  test("clearing selection via x button works", async ({ page }) => {
    // Select a service first
    await page.fill("#service-search", "building permit");
    await page.locator("#service-dropdown .service-option").first().click();

    // Should have a selection
    const before = await page.evaluate(() =>
      document.getElementById("service-select").value
    );
    expect(before).not.toBe("");

    // Click the clear button
    await page.click("#service-selected .clear-service");

    const after = await page.evaluate(() =>
      document.getElementById("service-select").value
    );
    expect(after).toBe("");

    const label = await page.evaluate(() =>
      document.getElementById("service-selected").textContent
    );
    expect(label.trim()).toBe("");
  });

  test("no results shows empty dropdown", async ({ page }) => {
    await page.fill("#service-search", "xyznonexistent123");

    const optionCount = await page.evaluate(() =>
      document.querySelectorAll("#service-dropdown .service-option").length
    );
    expect(optionCount).toBe(0);
  });

  test("escape closes dropdown", async ({ page }) => {
    await page.click("#service-search");
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);

    await page.keyboard.press("Escape");
    await expect(page.locator("#service-dropdown")).not.toHaveClass(/open/);
  });
});
