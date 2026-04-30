import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, ".env") });

const APP_BASE_URL = process.env.APP_BASE_URL;
const CMS_BASE_URL = process.env.CMS_BASE_URL;

if (!APP_BASE_URL || !CMS_BASE_URL) {
  throw new Error(
    "APP_BASE_URL and CMS_BASE_URL must be set (via .env file or environment) before running tests.",
  );
}

export default defineConfig({
  testDir: ".",
  timeout: 100 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: "./fixtures/global-setup.ts",
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    headless: false,
  },
  projects: [
    {
      name: "app",
      testDir: "./app",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: APP_BASE_URL,
        storageState: "./.auth/app.json",
      },
    },
    {
      name: "cms",
      testDir: "./cms",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: CMS_BASE_URL,
        storageState: "./.auth/cms.json",
      },
    },
  ],
});
