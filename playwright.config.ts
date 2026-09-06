import { defineConfig, devices } from "@playwright/test";

// CI 用 Playwright 自带 Chromium（npx playwright install --with-deps chromium）；
// 本地开发默认系统 Chrome（channel: chrome）。T25c。
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure", screenshot: "only-on-failure", headless: true },
  projects: [
    {
      name: "chromium",
      use: isCi
        ? { ...devices["Desktop Chrome"] }
        : { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: { command: "npm run e2e:serve", url: "http://127.0.0.1:3100/login", reuseExistingServer: true, timeout: 120_000 },
});
