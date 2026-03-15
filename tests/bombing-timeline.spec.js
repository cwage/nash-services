const { test, expect } = require("@playwright/test");

test("Christmas bombing timeline - 2-hour windows across Dec 25", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");

  await page.waitForFunction(() => {
    const sel = document.getElementById("service-select");
    return sel && sel.options.length > 1;
  }, { timeout: 15000 });

  // Set up the search — use fill() so input events fire
  await page.selectOption("#service-select",
    "Metro_Nashville_Police_Department_Calls_for_Service_2020");
  await page.fill("#address-input", "166 2nd Ave N, Nashville, TN");
  await page.fill("#radius-input", "2");
  await page.evaluate(() => {
    document.getElementById("radius-slider").value = "2";
    document.getElementById("date-range").style.display = "";
    document.getElementById("date-from").min = "2020-01-01T00:00";
    document.getElementById("date-to").max = "2021-01-01T00:00";
  });
  // Wait for updateDateRange to finish
  await page.waitForTimeout(2000);

  // Walk through 2-hour windows across Dec 25
  // Bombing was ~12:30 UTC (6:30 AM CST)
  const windows = [
    { from: "2020-12-25T06:00", to: "2020-12-25T08:00", label: "midnight-2am CST" },
    { from: "2020-12-25T08:00", to: "2020-12-25T10:00", label: "2am-4am CST" },
    { from: "2020-12-25T10:00", to: "2020-12-25T12:00", label: "4am-6am CST (pre-bombing)" },
    { from: "2020-12-25T12:00", to: "2020-12-25T14:00", label: "6am-8am CST (BOMBING)" },
    { from: "2020-12-25T14:00", to: "2020-12-25T16:00", label: "8am-10am CST (aftermath)" },
    { from: "2020-12-25T16:00", to: "2020-12-25T18:00", label: "10am-noon CST" },
    { from: "2020-12-25T18:00", to: "2020-12-25T20:00", label: "noon-2pm CST" },
    { from: "2020-12-25T20:00", to: "2020-12-25T22:00", label: "2pm-4pm CST" },
  ];

  const timeline = [];

  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];

    await page.evaluate(({ from, to }) => {
      document.getElementById("date-from").value = from;
      document.getElementById("date-to").value = to;
    }, w);

    // Trigger search
    await page.click("#search-btn");

    // Wait for results
    await page.waitForFunction(() => {
      const status = document.getElementById("status").textContent;
      return !status.includes("Searching");
    }, { timeout: 30000 });

    // Collect data
    const data = await page.evaluate(() => {
      const status = document.getElementById("status").textContent;
      const sectorRows = document.querySelectorAll(".sector-row");
      const sectors = {};
      sectorRows.forEach(r => {
        const name = r.querySelector(".sector-name").textContent.trim();
        const count = parseInt(r.querySelector(".sector-count").textContent.trim());
        sectors[name] = count;
      });
      return { status, sectors };
    });

    const entry = {
      window: w.label,
      from: w.from,
      to: w.to,
      central: data.sectors["Central"] || 0,
      totalSectors: Object.values(data.sectors).reduce((a, b) => a + b, 0),
      sectors: data.sectors,
      status: data.status,
    };
    timeline.push(entry);

    // Screenshot each window
    const idx = String(i).padStart(2, "0");
    await page.screenshot({
      path: `/tests/timeline-${idx}-${w.label.replace(/[^a-zA-Z0-9]/g, "_")}.png`,
      fullPage: true,
    });
  }

  // Print the timeline
  console.log("\n=== CHRISTMAS BOMBING TIMELINE ===\n");
  console.log("Window                        | Central | Total | Central %");
  console.log("------------------------------|---------|-------|----------");
  for (const e of timeline) {
    const pct = e.totalSectors > 0
      ? Math.round((e.central / e.totalSectors) * 100) : 0;
    const bar = "#".repeat(Math.round(e.central / 2));
    console.log(
      `${e.window.padEnd(30)}| ${String(e.central).padStart(7)} | ${String(e.totalSectors).padStart(5)} | ${String(pct).padStart(7)}%  ${bar}`
    );
  }

  // Assertions: Central should spike during bombing window
  const preBombing = timeline.find(t => t.window === "4am-6am CST (pre-bombing)");
  const bombing = timeline.find(t => t.window === "6am-8am CST (BOMBING)");
  const aftermath = timeline.find(t => t.window === "8am-10am CST (aftermath)");

  console.log(`\nPre-bombing Central: ${preBombing?.central}`);
  console.log(`Bombing Central: ${bombing?.central}`);
  console.log(`Aftermath Central: ${aftermath?.central}`);

  expect(bombing.central).toBeGreaterThan(25);
  expect(bombing.central).toBeGreaterThan(preBombing.central);
});
