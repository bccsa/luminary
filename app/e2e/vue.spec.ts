import { test, expect } from "@playwright/test";

// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro

test("syncs correct document types", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            const dbRequest = indexedDB.open("luminary-db");

            dbRequest.onerror = () => reject("Error opening database");

            dbRequest.onsuccess = () => {
                const db = dbRequest.result;

                const transaction = db.transaction("docs", "readonly");
                const store = transaction.objectStore("docs");

                const allDocsRequest = store.getAll();
                allDocsRequest.onerror = () => reject("Failed to read object store");
                allDocsRequest.onsuccess = () => resolve(allDocsRequest.result);
            };
        }) as unknown as Promise<any>;
    });
    const docTypes = result.map((doc: any) => doc.type);

    const expectedDocTypes = ["redirect", "tag", "post", "language"];

    expect(docTypes).toContain(expectedDocTypes);
});
