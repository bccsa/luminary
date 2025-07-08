// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro
import { test as base, chromium, expect } from "@playwright/test";

async function waitForExpect(
    assertion: () => void | Promise<void>,
    timeout = 30000,
    interval = 100,
): Promise<void> {
    const startTime = Date.now();
    let lastError: any;
    while (Date.now() - startTime < timeout) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((res) => setTimeout(res, interval));
        }
    }
    throw lastError;
}

// Helper function to handle Auth0 login
async function loginWithAuth0(page) {
    try {
        // 1. Go to your app's login page
        await page.goto("/", { waitUntil: "networkidle" });

        // 2. Click the login button if present
        const loginButtonVisible = await page.isVisible(
            'button:has-text("Login"), a:has-text("Login")',
        );
        if (loginButtonVisible) {
            await page.click('button:has-text("Login"), a:has-text("Login")');
        }

        // 3. Wait for Auth0 login page by URL
        await page.waitForURL(/auth0/, { timeout: 10000 });

        // 4. Fill Auth0 login form
        await page.waitForSelector('input[name="username"], input[type="email"]', {
            timeout: 10000,
        });
        await page.fill('input[name="username"], input[type="email"]', "test-user@example.com");
        await page.click('button[type="submit"]');
        await page.fill('input[name="password"], input[type="password"]', "test-password");
        await page.click('button[type="submit"]');

        // 5. Wait for redirect back to your app
        await page.waitForNavigation({ waitUntil: "networkidle" });

        console.log("Successfully logged in with Auth0");
    } catch (error) {
        console.error("Auth0 login failed:", error);
        throw error;
    }
}

// Use a persistent context for indexedDB support
const test = base.extend({
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext("", {
            headless: true,
            locale: "en",
        });
        await use(context);
        await context.close();
    },
});

test("it syncs correct document types to the cms client", async ({ context }) => {
    const page = await context.newPage();

    await loginWithAuth0(page);

    // You may not need to re-navigate after login, but if you do:
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const result = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
            if ("databases" in indexedDB) {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onerror = (event) => {
                    console.error("Error opening database", event);
                    reject("Error opening database");
                };
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const transaction = db.transaction("docs", "readonly");
                    const objectStore = transaction.objectStore("docs");
                    const request = objectStore.getAll();
                    request.onerror = (event) => {
                        console.error("Error getting all documents", event);
                        reject("Error getting all documents");
                    };
                    request.onsuccess = () => {
                        const documents = request.result;
                        resolve(documents);
                    };
                };
            } else {
                console.error("indexedDB.databases() not supported");
                reject("indexedDB.databases() not supported");
            }
        }) as unknown as Promise<any[]>;
    });

    await waitForExpect(() => {
        expect(result).toBeDefined();
        const types = [...new Set(result.map((doc: any) => doc.type))];
        expect(types).toEqual(
            expect.arrayContaining(["language", "redirect", "content", "group", "post", "tag"]),
        );
    });
});
