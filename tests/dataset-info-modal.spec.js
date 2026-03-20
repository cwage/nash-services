const { test, expect } = require("@playwright/test");

test.describe("Dataset info modal", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  test("clicking ? in dropdown opens info modal without selecting service", async ({ page }) => {
    await page.fill("#service-search", "building permit");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });

    await page.locator("#service-dropdown .dropdown-info-btn").first().click();

    // Modal should be open
    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    // Modal should have content
    const title = await page.textContent("#dataset-info-title");
    expect(title.length).toBeGreaterThan(0);
    const about = await page.textContent(".info-about");
    expect(about.length).toBeGreaterThan(0);

    // Service should NOT have been selected (hidden select still empty)
    const selectedValue = await page.evaluate(() =>
      document.getElementById("service-select").value
    );
    expect(selectedValue).toBe("");
  });

  test("dropdown stays visible behind info modal", async ({ page }) => {
    await page.fill("#service-search", "fire");
    await page.waitForSelector("#service-dropdown.open", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();

    // Modal is open
    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    // Dropdown should still be open behind the modal
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);
  });

  test("closing modal via Close button restores dropdown", async ({ page }) => {
    await page.fill("#service-search", "police");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();
    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    await page.click("#dataset-info-close");

    await expect(page.locator("#dataset-info-overlay")).not.toHaveClass(/open/);
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);
  });

  test("closing modal via Escape restores dropdown", async ({ page }) => {
    await page.fill("#service-search", "police");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();
    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    await page.keyboard.press("Escape");

    await expect(page.locator("#dataset-info-overlay")).not.toHaveClass(/open/);
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);
  });

  test("closing modal via backdrop click restores dropdown", async ({ page }) => {
    await page.fill("#service-search", "police");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();
    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    // Click the overlay backdrop (not the modal itself)
    await page.locator("#dataset-info-overlay").click({ position: { x: 5, y: 5 } });

    await expect(page.locator("#dataset-info-overlay")).not.toHaveClass(/open/);
    await expect(page.locator("#service-dropdown")).toHaveClass(/open/);
  });

  test("? button on selected service chip opens info modal", async ({ page }) => {
    await page.fill("#service-search", "building permit");
    await page.locator("#service-dropdown .service-option").first().click();

    // Should have a ? button on the selected chip
    await page.waitForSelector("#service-selected .dataset-info-btn", { timeout: 3000 });
    await page.click("#service-selected .dataset-info-btn");

    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);
    const title = await page.textContent("#dataset-info-title");
    expect(title.length).toBeGreaterThan(0);
  });

  test("info modal shows derived tips for geocode+polled service", async ({ page }) => {
    // MNPD dispatch is geocode + polled
    await page.fill("#service-search", "MNPD active");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();

    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    const tips = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".info-tips li")).map(li => li.textContent)
    );
    expect(tips.some(t => t.includes("geocoded"))).toBe(true);
    expect(tips.some(t => t.includes("Live data"))).toBe(true);
  });

  test("info modal shows date tip for date-filterable service", async ({ page }) => {
    await page.fill("#service-search", "crash");
    await page.waitForSelector("#service-dropdown .dropdown-info-btn", { timeout: 3000 });
    await page.locator("#service-dropdown .dropdown-info-btn").first().click();

    await expect(page.locator("#dataset-info-overlay")).toHaveClass(/open/);

    const tips = await page.evaluate(() =>
      Array.from(document.querySelectorAll(".info-tips li")).map(li => li.textContent)
    );
    expect(tips.some(t => t.includes("date range"))).toBe(true);
  });
});
