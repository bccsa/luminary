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

/** Fake-IdP mode: a local, disposable stack rather than a shared deployment. */
const LOCAL_STACK = !!process.env.E2E_COUCHDB_URL;

/**
 * Each test gets its own browser context and IndexedDB, and the persona specs
 * only read, so they parallelise cleanly against a local stack. A deployed
 * environment is shared with other consumers, so that mode stays serial.
 */
const workers = LOCAL_STACK
    ? Number(process.env.E2E_WORKERS ?? (process.env.CI ? 4 : 0)) || undefined
    : process.env.CI
      ? 1
      : undefined;

export default defineConfig({
    testDir: ".",
    timeout: LOCAL_STACK ? 60 * 1000 : 100 * 1000,
    expect: {
        timeout: 10 * 1000,
    },
    forbidOnly: !!process.env.CI,
    fullyParallel: LOCAL_STACK,
    workers,
    // A local stack is deterministic enough that a second failure is a real one;
    // a deployed environment gets more slack for transient network faults.
    retries: process.env.CI ? (LOCAL_STACK ? 1 : 2) : 0,
    reporter: process.env.CI
        ? [["github"], ["html", { open: "never" }], ["list"]]
        : [["html", { open: "never" }], ["list"]],
    globalSetup: "./fixtures/global-setup.ts",
    use: {
        trace: "retain-on-failure",
        // Recording every test to discard most of it is the single largest
        // per-test overhead; a retry is where the video is actually wanted.
        video: "on-first-retry",
        screenshot: "only-on-failure",
        headless: true,
    },
    projects: [
        {
            name: "app",
            testDir: "./app",
            use: {
                ...devices["Desktop Chrome"],
                baseURL: APP_BASE_URL,
                // Personas sign in per test, so there is no shared state to load.
                storageState: LOCAL_STACK ? undefined : "./.auth/app.json",
            },
        },
        {
            name: "cms",
            testDir: "./cms",
            use: {
                ...devices["Desktop Chrome"],
                baseURL: CMS_BASE_URL,
                storageState: LOCAL_STACK ? undefined : "./.auth/cms.json",
            },
        },
    ],
});
