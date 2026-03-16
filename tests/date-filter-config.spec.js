const { test, expect } = require("@playwright/test");
const { pickService } = require("./helpers");

// Services that have date_field configured in services.yml
const DATE_SERVICES = [
  { name: "MNPD_Calls_for_Service_2025_view", dateField: "Call_Received", desc: "police calls 2025" },
  { name: "hubNashville_311_Service_Requests_Current_Year_view", dateField: "Date_Time_Opened", desc: "311 current year" },
  { name: "Building_Permits_Issued_2", dateField: "Date_Issued", desc: "building permits" },
];

// Services that should NOT show a date picker
const NO_DATE_SERVICES = [
  { name: "NERVE_Facilities_Public_View", desc: "NERVE facilities" },
  { name: "License_Plate_Reader_Locations", desc: "LPR cameras" },
  { name: "Library_Facilities", desc: "libraries" },
];

test.describe("Date filter configuration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => {
      const sel = document.getElementById("service-select");
      return sel && sel.options.length > 1;
    }, { timeout: 15000 });
  });

  for (const svc of DATE_SERVICES) {
    test(`${svc.desc} shows date picker with correct field`, async ({ page }) => {
      test.setTimeout(30000);
      await pickService(page, svc.name);

      // Wait for updateDateRange to fetch info and populate
      await page.waitForFunction(() => {
        return document.getElementById("date-range").style.display !== "none";
      }, { timeout: 15000 });

      // Date inputs should have values
      const fromVal = await page.inputValue("#date-from");
      const toVal = await page.inputValue("#date-to");
      expect(fromVal).toBeTruthy();
      expect(toVal).toBeTruthy();

      // 'from' should be before 'to'
      expect(new Date(fromVal).getTime()).toBeLessThan(new Date(toVal).getTime());

      // Verify the /info endpoint returns the expected date_field
      const resp = await page.evaluate(
        (name) => fetch(`/info/${name}`).then(r => r.json()),
        svc.name
      );
      expect(resp.date_field).toBe(svc.dateField);
    });
  }

  for (const svc of NO_DATE_SERVICES) {
    test(`${svc.desc} hides date picker`, async ({ page }) => {
      test.setTimeout(30000);
      await pickService(page, svc.name);

      // Wait for the info fetch to complete
      await page.waitForTimeout(2000);

      const display = await page.evaluate(() =>
        document.getElementById("date-range").style.display
      );
      expect(display).toBe("none");

      // Verify the /info endpoint returns no date_field
      const resp = await page.evaluate(
        (name) => fetch(`/info/${name}`).then(r => r.json()),
        svc.name
      );
      expect(resp.date_field).toBeNull();
    });
  }

  test("switching from date service to non-date service hides picker", async ({ page }) => {
    test.setTimeout(30000);

    // Select a service with dates
    await pickService(page, "MNPD_Calls_for_Service_2025_view");
    await page.waitForFunction(() => {
      return document.getElementById("date-range").style.display !== "none";
    }, { timeout: 15000 });

    // Verify dates are populated
    const fromBefore = await page.inputValue("#date-from");
    expect(fromBefore).toBeTruthy();

    // Switch to a service without dates
    await pickService(page, "Library_Facilities");
    await page.waitForFunction(() => {
      return document.getElementById("date-range").style.display === "none";
    }, { timeout: 15000 });
  });

  test("switching between two date services resets dates to new range", async ({ page }) => {
    test.setTimeout(30000);

    // Select 311 current year
    await pickService(page, "hubNashville_311_Service_Requests_Current_Year_view");
    await page.waitForFunction(() => {
      return document.getElementById("date-range").style.display !== "none";
    }, { timeout: 15000 });

    const firstFrom = await page.inputValue("#date-from");

    // Switch to building permits — dates should update
    await pickService(page, "Building_Permits_Issued_2");
    await page.waitForFunction((oldFrom) => {
      const val = document.getElementById("date-from").value;
      return val && val !== oldFrom;
    }, firstFrom, { timeout: 15000 });

    const secondFrom = await page.inputValue("#date-from");
    expect(secondFrom).toBeTruthy();
    expect(secondFrom).not.toBe(firstFrom);
  });
});
