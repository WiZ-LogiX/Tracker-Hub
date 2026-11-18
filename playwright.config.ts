import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 35_000,
  retries: 1,
  use: {
    baseURL: "http://localhost:8081",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "npm run dev",
      port: 8081,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "npx vite preview --port 8082",
      port: 8082,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
