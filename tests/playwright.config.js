const { defineConfig } = require("@playwright/test");

const baseURL = process.env.BASE_URL || "http://api:5000";

module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  use: {
    baseURL,
    headless: true,
    screenshot: "on",
    trace: "on",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: "nashServicesVisited", value: "1" }],
        },
      ],
    },
  },
  reporter: [["list"]],
  projects: [
    {
      name: "fast",
      testMatch: [
        "about-modal.spec.js",
        "address-highlight.spec.js",
        "date-nav.spec.js",
        "dataset-info-modal.spec.js",
        "dropdown-reopen.spec.js",
        "service-filter.spec.js",
        "short-urls.spec.js",
        "timezone.spec.js",
      ],
    },
    {
      name: "live",
      testMatch: [
        "auto-search.spec.js",
        "core.spec.js",
        "date-filter-config.spec.js",
        "marker-colors.spec.js",
        "polled-services.spec.js",
        "record-deeplink.spec.js",
        "viewport-filter.spec.js",
      ],
    },
    {
      name: "audit",
      testMatch: ["audit-services.spec.js"],
    },
    {
      name: "full",
      testMatch: "*.spec.js",
    },
  ],
});
