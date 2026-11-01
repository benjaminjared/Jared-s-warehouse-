import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "/tmp/warehouse-quest-tests",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: { args: ["--no-sandbox"] },
    headless: true,
  },
});