import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.SMOKE_TEST_URL || "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure",
  },
});
