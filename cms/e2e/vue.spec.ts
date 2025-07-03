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

// // Helper function to handle Auth0 login
// async function loginWithAuth0(page) {
//     try {
//         // Navigate to your app's login page
//         await page.goto("/", { waitUntil: "networkidle" });

//         // Check if there's a login button to click (if not already on Auth0 page)
//         const loginButtonVisible = await page.isVisible(
//             'button:has-text("Login"), a:has-text("Login")',
//         );
//         if (loginButtonVisible) {
//             await page.click('button:has-text("Login"), a:has-text("Login")');
//         }

//         // Wait for Auth0 login page to load
//         await page.waitForSelector('input[name="username"], input[type="email"]', {
//             timeout: 10000,
//         });

//         // Fill Auth0 login form - get credentials from environment variables
//         await page.fill('input[name="username"], input[type="email"]', "test-user@example.com");
//         await page.fill('input[name="password"], input[type="password"]', "test-password");

//         // Click login button
//         await page.click('button[type="submit"]');

//         // Wait for redirect back to your app after successful login
//         await page.waitForNavigation({ waitUntil: "networkidle" });

//         console.log("Successfully logged in with Auth0");
//     } catch (error) {
//         console.error("Auth0 login failed:", error);
//         throw error;
//     }
// }

//indexedDB.databases() is not supported in all browsers so make context chromium
const test = base.extend({
    // Playwright requires the first parameter in the context function to be an object
    // "_" does not work here.
    // eslint-disable-next-line no-empty-pattern
    context: async ({}, use) => {
        const context = await chromium.launchPersistentContext("", {
            headless: true,
            locale: "en",
        });

        // Create a page and login with Auth0
        const page = await context.newPage();
        // await loginWithAuth0(page);
        await page.close(); // Close this page after authentication

        await use(context);
        await context.close();
    },
});

test("it syncs correct document types to the cms client", async ({ context }) => {
    const page = await context.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    // Wait for any post load navigation to prevent errors
    await page.waitForTimeout(1000);

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
        expect(types).toEqual(
            expect.arrayContaining(["language", "redirect", "content", "group", "post", "tag"]),
        );
    });
});
