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
});
