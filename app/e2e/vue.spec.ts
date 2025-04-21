import { test, expect } from "@playwright/test";

// Leaving link in file for reference to Playwright documentation
// https://playwright.dev/docs/intro

test("syncs correct document types", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const result = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            //The timeout makes debugging easier if something silently breaks
            const timeout = setTimeout(() => reject("Timeout in evaluate"), 5000);

            const dbRequest = indexedDB.open("luminary-db");

            dbRequest.onerror = () => {
                clearTimeout(timeout);
                reject("Error opening database");
            };

            dbRequest.onsuccess = () => {
                const db = dbRequest.result;

                const transaction = db.transaction("docs", "readonly");
                const store = transaction.objectStore("docs");

                const allDocsRequest = store.getAll();
                allDocsRequest.onerror = () => {
                    clearTimeout(timeout);
                    reject("Failed to read object store");
                };
                allDocsRequest.onsuccess = () => {
                    clearTimeout(timeout);
                    resolve(allDocsRequest.result);
                };
            };
        }) as unknown as Promise<any>;
    });
    const docTypes = result.map((doc: any) => doc.type);

    const expectedDocTypes = ["redirect", "tag", "post", "language"];

    for (const expected of expectedDocTypes) {
        expect(docTypes).toContain(expected);
    }
});
