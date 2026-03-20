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
        "core.spec.js",
        "service-filter.spec.js",
        "auto-search.spec.js",
        "viewport-filter.spec.js",
        "marker-colors.spec.js",
        "polled-services.spec.js",
        "date-filter-config.spec.js",
        "short-urls.spec.js",
      ],
    },
    {
      name: "full",
      testMatch: "*.spec.js",
    },
  ],
});
