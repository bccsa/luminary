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

function makeTest(sessionFile: string | null) {
    return base.extend({
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

export const cmsTest = makeTest("cms-session.json");

/**
 * Variant of cmsTest that uses the second test user. The corresponding
 * `.auth/cms-user2.json` storage state must be selected by callers via
 * `test.use({ storageState: ".auth/cms-user2.json" })`. Specs that need user 2
 * should skip when its credentials/state are not provisioned.
 */
export const cmsUser2Test = makeTest("cms-user2-session.json");

export const appTest = makeTest(null);
export { expect };
