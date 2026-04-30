import type { Page } from "@playwright/test";

/**
 * Helpers for reading the in-browser `luminary-db` IndexedDB from a Playwright
 * test. All queries are run via `page.evaluate` so the result is whatever the
 * browser sees right now — including writes the app made via `db.upsert`.
 */

const DB_NAME = "luminary-db";

type ReadAllOptions = {
    /** Filter records whose `type` field equals this value. */
    type?: string;
    /** Filter records whose `status` field equals this value. */
    status?: string;
};

/**
 * Read every record from a store, optionally filtered. Use sparingly — this
 * pulls the whole table across the bridge — but it's fine for the small
 * `localChanges` table or for one-off lookups.
 */
export async function readAll<T = unknown>(
    page: Page,
    storeName: string,
    options: ReadAllOptions = {},
): Promise<T[]> {
    return page.evaluate(
        ({ dbName, store, opts }) =>
            new Promise<T[]>((resolve, reject) => {
                const req = indexedDB.open(dbName);
                req.onerror = () => reject(new Error(`Failed to open ${dbName}`));
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction(store, "readonly");
                    const objectStore = tx.objectStore(store);
                    const all = objectStore.getAll();
                    all.onerror = () =>
                        reject(new Error(`Failed to read ${store}: ${all.error?.message}`));
                    all.onsuccess = () => {
                        let docs = all.result as Array<Record<string, unknown>>;
                        if (opts.type !== undefined)
                            docs = docs.filter((d) => d.type === opts.type);
                        if (opts.status !== undefined)
                            docs = docs.filter((d) => d.status === opts.status);
                        resolve(docs as T[]);
                    };
                };
            }),
        { dbName: DB_NAME, store: storeName, opts: options },
    );
}

/**
 * Read all queued local changes for a specific document. Returns an empty
 * array if the doc has no pending changes (or if the DB doesn't exist yet).
 */
export async function readLocalChangesForDoc(page: Page, docId: string): Promise<unknown[]> {
    return page.evaluate(
        ({ dbName, id }) =>
            new Promise<unknown[]>((resolve, reject) => {
                const req = indexedDB.open(dbName);
                req.onerror = () => reject(new Error(`Failed to open ${dbName}`));
                req.onsuccess = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains("localChanges")) {
                        resolve([]);
                        return;
                    }
                    const tx = db.transaction("localChanges", "readonly");
                    const store = tx.objectStore("localChanges");
                    const idx = store.index("docId");
                    const all = idx.getAll(IDBKeyRange.only(id));
                    all.onerror = () =>
                        reject(new Error(`Failed to read localChanges: ${all.error?.message}`));
                    all.onsuccess = () => resolve(all.result as unknown[]);
                };
            }),
        { dbName: DB_NAME, id: docId },
    );
}

/**
 * Read a single doc by `_id` from the `docs` store. Returns null if missing.
 */
export async function readDoc<T = unknown>(page: Page, docId: string): Promise<T | null> {
    return page.evaluate(
        ({ dbName, id }) =>
            new Promise<T | null>((resolve, reject) => {
                const req = indexedDB.open(dbName);
                req.onerror = () => reject(new Error(`Failed to open ${dbName}`));
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction("docs", "readonly");
                    const store = tx.objectStore("docs");
                    const get = store.get(id);
                    get.onerror = () =>
                        reject(new Error(`Failed to read doc: ${get.error?.message}`));
                    get.onsuccess = () => resolve((get.result ?? null) as T | null);
                };
            }),
        { dbName: DB_NAME, id: docId },
    );
}

type SeededPost = {
    _id: string;
    parentId: string;
    parentTagOrPostType: string;
    languageCode: string;
    title: string;
    slug: string;
    status: string;
    memberOf: string[];
};

/**
 * Pick a seeded published Content doc whose parent is a Post. Returns enough
 * info to navigate to the editor for it. Polls because the initial sync can
 * take a few seconds after page load.
 *
 * Returns null if no suitable post is present in the synced dataset — caller
 * should `test.skip()` rather than fail cryptically.
 */
export async function findSeededPublishedPost(
    page: Page,
    timeoutMs = 30_000,
): Promise<SeededPost | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await page.evaluate(
            (dbName) =>
                new Promise<SeededPost | null>((resolve, reject) => {
                    const req = indexedDB.open(dbName);
                    req.onerror = () => reject(new Error(`Failed to open ${dbName}`));
                    req.onsuccess = () => {
                        const db = req.result;
                        const tx = db.transaction("docs", "readonly");
                        const store = tx.objectStore("docs");
                        const all = store.getAll();
                        all.onerror = () =>
                            reject(new Error(`Failed to read docs: ${all.error?.message}`));
                        all.onsuccess = () => {
                            const docs = all.result as Array<Record<string, unknown>>;

                            const languages = docs.filter((d) => d.type === "language");
                            const langById = new Map<string, string>();
                            for (const l of languages) {
                                if (typeof l._id === "string" && typeof l.languageCode === "string")
                                    langById.set(l._id, l.languageCode);
                            }

                            const content = docs.find((d) => {
                                if (d.type !== "content") return false;
                                if (d.parentType !== "post") return false;
                                if (d.status !== "published") return false;
                                if (typeof d.parentId !== "string") return false;
                                if (typeof d.language !== "string") return false;
                                return langById.has(d.language as string);
                            });

                            if (!content) {
                                resolve(null);
                                return;
                            }

                            const parent = docs.find(
                                (d) => d._id === content.parentId && d.type === "post",
                            );
                            if (!parent) {
                                resolve(null);
                                return;
                            }

                            const parentTagOrPostType =
                                (parent.postType as string) ?? (parent.tagType as string) ?? "blog";

                            resolve({
                                _id: content._id as string,
                                parentId: content.parentId as string,
                                parentTagOrPostType,
                                languageCode: langById.get(content.language as string) ?? "eng",
                                title: (content.title as string) ?? "",
                                slug: (content.slug as string) ?? "",
                                status: content.status as string,
                                memberOf: ((parent.memberOf as string[] | undefined) ?? []).slice(),
                            });
                        };
                    };
                }),
            DB_NAME,
        );

        if (result) return result;
        await page.waitForTimeout(500);
    }
    return null;
}
