const { test, expect } = require("@playwright/test");

test("audit all services for empty results", async ({ request }) => {
  // Long timeout — ~80 services with delays
  test.setTimeout(600000);

  // Get the service list from the API
  const servicesResp = await request.get("/services");
  expect(servicesResp.ok()).toBe(true);
  const { services } = await servicesResp.json();
  console.log(`\nAuditing ${services.length} services...\n`);

  const address = "1001 Broadway, Nashville, TN";
  const radius = 5;
  const results = [];

  for (const svc of services) {
    const name = svc.name;
    let entry = { name, description: svc.description, category: svc.category };

    try {
      const resp = await request.get(
        `/nearby/${name}?address=${encodeURIComponent(address)}&radius=${radius}`
      );

      if (!resp.ok()) {
        entry.status = "error";
        entry.error = `HTTP ${resp.status()}`;
        const body = await resp.json().catch(() => null);
        if (body?.error) entry.error += `: ${body.error}`;
      } else {
        const data = await resp.json();
        entry.status = "ok";
        entry.count = data.count;
        entry.totalFetched = data.total_fetched ?? data.total_cached ?? 0;
        entry.noLocation = data.no_location ?? 0;
        entry.hasGeometry = data.has_geometry;
        entry.addressField = data.address_field;
      }
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
    }

    results.push(entry);

    // Brief status line
    const icon = entry.status === "error" ? "ERR"
      : entry.count === 0 ? " 0 "
      : " ok";
    const countStr = entry.count !== undefined
      ? `${entry.count} nearby / ${entry.totalFetched} fetched`
      : entry.error;
    console.log(`  [${icon}] ${name}: ${countStr}`);

    // Be polite to ArcGIS
    await new Promise(r => setTimeout(r, 1500));
  }

  // --- Report ---
  const errors = results.filter(r => r.status === "error");
  const empty = results.filter(r => r.status === "ok" && r.count === 0 && r.totalFetched === 0);
  const fetchedButNoneNearby = results.filter(r => r.status === "ok" && r.count === 0 && r.totalFetched > 0);
  const hasResults = results.filter(r => r.status === "ok" && r.count > 0);

  console.log("\n\n=== SERVICE AUDIT REPORT ===\n");
  console.log(`Total services: ${results.length}`);
  console.log(`With nearby results: ${hasResults.length}`);
  console.log(`Fetched data but none nearby: ${fetchedButNoneNearby.length}`);
  console.log(`Completely empty (0 fetched): ${empty.length}`);
  console.log(`Errors: ${errors.length}`);

  if (empty.length > 0) {
    console.log("\n--- EMPTY (0 records fetched — candidates for removal) ---");
    for (const r of empty) {
      console.log(`  ${r.name} [${r.category}] - ${r.description}`);
    }
  }

  if (fetchedButNoneNearby.length > 0) {
    console.log("\n--- FETCHED BUT NONE NEARBY (data exists, but not within 5mi of downtown) ---");
    for (const r of fetchedButNoneNearby) {
      console.log(`  ${r.name}: ${r.totalFetched} fetched, ${r.noLocation} without location [${r.category}]`);
    }
  }

  if (errors.length > 0) {
    console.log("\n--- ERRORS ---");
    for (const r of errors) {
      console.log(`  ${r.name}: ${r.error}`);
    }
  }

  if (hasResults.length > 0) {
    console.log("\n--- WORKING (have nearby results) ---");
    for (const r of hasResults.sort((a, b) => b.count - a.count)) {
      console.log(`  ${r.name}: ${r.count} nearby / ${r.totalFetched} fetched`);
    }
  }

  // Write full results as JSON artifact
  const fs = require("fs");
  fs.writeFileSync("/tests/audit-results.json", JSON.stringify(results, null, 2));
  console.log("\nFull results written to /tests/audit-results.json");
});
