const { test, expect } = require("@playwright/test");

test("timezone shift behavior", async ({ page }) => {
  await page.goto("/");

  // Simulate what happens in a CST browser (UTC-6)
  const result = await page.evaluate(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // This is the key: how does new Date("2020-12-25T12:00") behave?
    const d1 = new Date("2020-12-25T12:00");
    const d2 = new Date("2020-12-25T14:00");
    const spanMs = d2 - d1;

    // Shift back
    const shifted = new Date(d1.getTime() - spanMs);

    // toISOString always returns UTC
    const isoShifted = shifted.toISOString().slice(0, 16);

    // But the input value format is local time
    // datetime-local inputs use LOCAL time, not UTC
    // So we need to format in local time, not UTC
    const localShifted = shifted.getFullYear() + "-" +
      String(shifted.getMonth() + 1).padStart(2, "0") + "-" +
      String(shifted.getDate()).padStart(2, "0") + "T" +
      String(shifted.getHours()).padStart(2, "0") + ":" +
      String(shifted.getMinutes()).padStart(2, "0");

    return {
      tz,
      d1_iso: d1.toISOString(),
      d1_local: d1.toString(),
      spanMs,
      isoShifted,
      localShifted,
      d1_hours_utc: d1.getUTCHours(),
      d1_hours_local: d1.getHours(),
    };
  });

  console.log("Timezone test:", JSON.stringify(result, null, 2));

  // localShifted should be correct for datetime-local inputs
  expect(result.localShifted).toBe("2020-12-25T10:00");
  // isoShifted would be wrong (it's UTC) — this is the bug we fixed
  expect(result.spanMs).toBe(7200000);
});
