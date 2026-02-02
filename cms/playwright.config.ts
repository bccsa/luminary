import { defineConfig, devices } from "@playwright/test";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read environment variables from .env file.
 */
dotenv.config({ path: path.resolve(__dirname, ".env") });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./e2e",
    /* Maximum time one test can run for. */
    timeout: 100 * 1000,
    expect: {
        /**
         * Maximum time expect() should wait for the condition to be met.
         * For example in `await expect(locator).toHaveText();`
         */
        timeout: 5000,
    },
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        baseURL: "http://localhost:4173",

        trace: "retain-on-failure",

        headless: true,
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        /**
         * Use the dev server by default for faster feedback loop.
         * Use the preview server on CI for more realistic testing.
         * Playwright will re-use the local server if there is already a dev-server running.
         */
        command: "vite build && vite preview --port 4173",
        port: 4173,
        reuseExistingServer: !process.env.CI,
        env: {
            VITE_AUTH_BYPASS: "true",
        },
    },
});
