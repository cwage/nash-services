const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  use: {
    baseURL: process.env.BASE_URL || "http://api:5000",
    headless: true,
    screenshot: "on",
    trace: "on",
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
        "clear-map.spec.js",
        "marker-colors.spec.js",
      ],
    },
    {
      name: "full",
      testMatch: "*.spec.js",
    },
  ],
});
