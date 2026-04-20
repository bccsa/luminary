import { appTest as test, expect } from "../../fixtures/test";

test.describe("App home page", () => {
    test("loads the home page", async ({ page }) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("banner")).toBeVisible();
        await expect(page.getByRole("main")).toBeVisible();
    });

    test("syncs documents into IndexedDB", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });

        const types = await page.evaluate(async () => {
            return new Promise<string[]>((resolve, reject) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onerror = () => reject("Error opening database");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const tx = db.transaction("docs", "readonly");
                    const store = tx.objectStore("docs");
                    const req = store.getAll();
                    req.onerror = () => reject("Error getting documents");
                    req.onsuccess = () => {
                        const docs = req.result as Array<{ type: string }>;
                        resolve([...new Set(docs.map((d) => d.type))]);
                    };
                };
            });
        });

        await expect
            .poll(() => types, { timeout: 30_000 })
            .toEqual(expect.arrayContaining(["language", "content"]));
    });

    test("does not sync drafted or expired docs to the client", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });

        const statuses = await page.evaluate(async () => {
            return new Promise<string[]>((resolve, reject) => {
                const dbRequest = indexedDB.open("luminary-db");
                dbRequest.onerror = () => reject("Error opening database");
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const tx = db.transaction("docs", "readonly");
                    const store = tx.objectStore("docs");
                    const req = store.getAll();
                    req.onerror = () => reject("Error getting documents");
                    req.onsuccess = () => {
                        const docs = req.result as Array<{ status?: string }>;
                        resolve([...new Set(docs.map((d) => d.status).filter(Boolean) as string[])]);
                    };
                };
            });
        });

        expect(statuses).not.toEqual(expect.arrayContaining(["draft"]));
        expect(statuses).not.toEqual(expect.arrayContaining(["expired"]));
        expect(statuses).toEqual(expect.arrayContaining(["published"]));
    });
});
