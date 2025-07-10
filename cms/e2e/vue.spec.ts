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

//indexedDB.databases() is not supported in all browsers so make context chromium
const test = base.extend({
    // Playwright requires the first parameter in the context function to be an object
    // "_" does not work here.
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext("", {
            // NOTE: Run in headful mode to see the browser actions
            // This is useful for debugging, but can be set to true for CI runs
            // or when you don't need to see the browser actions.
            headless: true,
            locale: "en",
        });
        await use(context);
        await context.close();
    },
});

const handleAuth0 = async (page: any) => {
    // Create a new random user email
    // This is necessary because the Auth0 test user might already exist
    // and the easiest way to avoid conflicts is to create a new user each time
    const userEmail = "test" + Math.floor(Math.random() * 999999999) + "@gmail.com";

    await page.goto("http://localhost:5173", { waitUntil: "networkidle" });

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/auth0\.com/);

    //Find the sign up button and click it
    const signUpButton = page.locator('a:has-text("Sign Up")');
    await signUpButton.click();

    await page.fill('input[name="email"]', userEmail);
    await page.fill('input[name="password"]', "#test@1234");

    await page.click('button[type="submit"]');

    await page.click('button[type="submit"]');

    // Wait for any post load navigation to prevent errors
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });
};

test("it syncs correct document types to the app(non-cms) client", async ({ context }) => {
    const page = await context.newPage();
    await handleAuth0(page);

    const result = await page.evaluate(async () => {
        return new Promise((resolve, reject) => {
            //Ensure that the browser supports indexedDB.databases() as it is not supported in all browsers
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
        expect(types.sort()).toEqual(
            ["content", "group", "language", "post", "redirect", "tag"].sort(),
        );
    });
});
