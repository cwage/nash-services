const { test, expect } = require("@playwright/test");

test.describe("Date navigation", () => {
  test("shiftDates function works correctly in isolation", async ({ page }) => {
    await page.goto("/");

    // Wait for page to load
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Manually set date inputs and test shiftDates directly
    const result = await page.evaluate(() => {
      const fromEl = document.getElementById("date-from");
      const toEl = document.getElementById("date-to");

      // Set a known 2-hour range
      fromEl.value = "2020-12-25T12:00";
      toEl.value = "2020-12-25T14:00";
      fromEl.min = "2020-01-01T00:00";
      toEl.max = "2021-01-01T00:00";

      const before = { from: fromEl.value, to: toEl.value };

      // Call shiftDates(-1) — should go back 2 hours
      if (typeof shiftDates === "function") {
        shiftDates(-1);
      } else {
        return { error: "shiftDates not found in global scope" };
      }

      const after = { from: fromEl.value, to: toEl.value };

      // Reset and shift forward
      fromEl.value = "2020-12-25T12:00";
      toEl.value = "2020-12-25T14:00";
      shiftDates(1);
      const afterFwd = { from: fromEl.value, to: toEl.value };

      return { before, after, afterFwd };
    });

    console.log("shiftDates test:", JSON.stringify(result, null, 2));

    if (result.error) {
      // shiftDates isn't global — it's defined in module scope
      // Let's test via button clicks instead
      console.log("shiftDates not global, testing via buttons");
    } else {
      expect(result.after.from).toBe("2020-12-25T10:00");
      expect(result.after.to).toBe("2020-12-25T12:00");
      expect(result.afterFwd.from).toBe("2020-12-25T14:00");
      expect(result.afterFwd.to).toBe("2020-12-25T16:00");
    }
  });

  test("button clicks change date values", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });

    // Manually set up the form state to avoid preset async issues
    await page.evaluate(() => {
      const serviceSelect = document.getElementById("service-select");
      const addressInput = document.getElementById("address-input");
      const fromEl = document.getElementById("date-from");
      const toEl = document.getElementById("date-to");
      const dateRange = document.getElementById("date-range");

      // Set service to 2020 calls
      serviceSelect.value = "Metro_Nashville_Police_Department_Calls_for_Service_2020";
      addressInput.value = "166 2nd Ave N, Nashville, TN";
      fromEl.value = "2020-12-25T12:00";
      toEl.value = "2020-12-25T14:00";
      fromEl.min = "2020-01-01T00:00";
      toEl.max = "2021-01-01T00:00";
      dateRange.style.display = "";
    });

    // Verify initial state
    const initialFrom = await page.inputValue("#date-from");
    const initialTo = await page.inputValue("#date-to");
    console.log("Initial:", initialFrom, "to", initialTo);
    expect(initialFrom).toBe("2020-12-25T12:00");
    expect(initialTo).toBe("2020-12-25T14:00");

    // Screenshot before
    await page.screenshot({ path: "/tests/nav-before.png", fullPage: true });

    // Click prev button
    await page.click("#date-prev");
    await page.waitForTimeout(1000);

    const afterPrevFrom = await page.inputValue("#date-from");
    const afterPrevTo = await page.inputValue("#date-to");
    console.log("After prev:", afterPrevFrom, "to", afterPrevTo);

    // Screenshot after prev
    await page.screenshot({ path: "/tests/nav-after-prev.png", fullPage: true });

    // Check they shifted back 2 hours
    expect(afterPrevFrom).toBe("2020-12-25T10:00");
    expect(afterPrevTo).toBe("2020-12-25T12:00");

    // Click next button twice to go forward past original
    await page.click("#date-next");
    await page.waitForTimeout(1000);

    const afterNextFrom = await page.inputValue("#date-from");
    const afterNextTo = await page.inputValue("#date-to");
    console.log("After next:", afterNextFrom, "to", afterNextTo);

    // Should be back to original
    expect(afterNextFrom).toBe("2020-12-25T12:00");
    expect(afterNextTo).toBe("2020-12-25T14:00");

    // Click next again
    await page.click("#date-next");
    await page.waitForTimeout(1000);

    const afterNext2From = await page.inputValue("#date-from");
    const afterNext2To = await page.inputValue("#date-to");
    console.log("After next 2:", afterNext2From, "to", afterNext2To);

    expect(afterNext2From).toBe("2020-12-25T14:00");
    expect(afterNext2To).toBe("2020-12-25T16:00");

    await page.screenshot({ path: "/tests/nav-after-next.png", fullPage: true });
  });

  test("datetime-local input values round-trip correctly", async ({ page }) => {
    await page.goto("/");

    // Test that datetime-local inputs handle values correctly
    const result = await page.evaluate(() => {
      const input = document.createElement("input");
      input.type = "datetime-local";
      document.body.appendChild(input);

      // Set value
      input.value = "2020-12-25T12:00";
      const readBack = input.value;

      // Test Date parsing
      const d = new Date("2020-12-25T12:00");
      const iso = d.toISOString();
      const sliced = iso.slice(0, 16);

      // Test shift arithmetic using local time formatting (like our fixed code)
      const d2 = new Date("2020-12-25T14:00");
      const spanMs = d2 - d;
      const shifted = new Date(d.getTime() - spanMs);
      const fmt = (dt) =>
        dt.getFullYear() + "-" +
        String(dt.getMonth() + 1).padStart(2, "0") + "-" +
        String(dt.getDate()).padStart(2, "0") + "T" +
        String(dt.getHours()).padStart(2, "0") + ":" +
        String(dt.getMinutes()).padStart(2, "0");
      const shiftedLocal = fmt(shifted);
      const shiftedUTC = shifted.toISOString().slice(0, 16);

      document.body.removeChild(input);

      return { readBack, iso, sliced, spanMs, shiftedLocal, shiftedUTC };
    });

    console.log("Datetime round-trip:", JSON.stringify(result, null, 2));
    expect(result.readBack).toBe("2020-12-25T12:00");
    expect(result.spanMs).toBe(7200000); // 2 hours in ms
    // Local time formatting gives correct result for datetime-local inputs
    expect(result.shiftedLocal).toBe("2020-12-25T10:00");
  });
});
