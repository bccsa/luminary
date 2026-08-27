import { test as base, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load a sessionStorage dump saved by global-setup and seed it into each page
 * on load via addInitScript. Playwright's storageState does not persist
 * sessionStorage, so auth providers that store tokens there need this shim.
 */
function loadSessionData(fileName: string): Record<string, string> | null {
    const p = path.resolve(__dirname, "../.auth", fileName);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
        return null;
    }
}

/** The shared deployed-environment session does not exist in fake-IdP mode. */
const LOCAL_STACK = !!process.env.E2E_COUCHDB_URL;

function makeTest(sessionFile: string | null, requiresDeployedSession = false) {
    return base.extend<{ modeGuard: undefined }>({
        modeGuard: [
            async ({}, use, testInfo) => {
                testInfo.skip(
                    requiresDeployedSession && LOCAL_STACK,
                    "Deployed-session specs do not apply in fake-IdP mode; sign in with a persona instead.",
                );
                await use(undefined);
            },
            { auto: true },
        ],
        context: async ({ context }, use) => {
            if (sessionFile) {
                const data = loadSessionData(sessionFile);
                if (data) {
                    await context.addInitScript((entries) => {
                        for (const [key, value] of Object.entries(entries)) {
                            sessionStorage.setItem(key, value as string);
                        }
                    }, data);
                }
            }
            await use(context);
        },
        page: async ({ page }, use) => {
            await use(page);
        },
    });
}

export const cmsTest = makeTest("cms-session.json", true);
export const appTest = makeTest(null);
export { expect };
