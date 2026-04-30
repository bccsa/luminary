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
 * List the language codes available in the synced dataset, excluding any
 * codes the caller already uses. Used by the translate spec to pick a
 * language to add.
 */
export async function listLanguageCodes(
    page: Page,
    excluding: string[] = [],
): Promise<string[]> {
    return page.evaluate(
        ({ dbName, exclude }) =>
            new Promise<string[]>((resolve, reject) => {
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
                        const codes = docs
                            .filter((d) => d.type === "language")
                            .map((d) => (d as { languageCode?: string }).languageCode)
                            .filter(
                                (c): c is string =>
                                    typeof c === "string" && !exclude.includes(c),
                            );
                        resolve(codes);
                    };
                };
            }),
        { dbName: DB_NAME, exclude: excluding },
    );
}

/**
 * Find the first content doc belonging to a parent post/tag. Returns null if
 * none has been synced yet (caller can poll). Used by publish/translate specs
 * that need to read the content's own `_id` and `status`.
 */
export async function findContentByParent<T = unknown>(
    page: Page,
    parentId: string,
    languageCode?: string,
): Promise<T | null> {
    return page.evaluate(
        ({ dbName, parent, lang }) =>
            new Promise<T | null>((resolve, reject) => {
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
                        const langDoc =
                            lang === undefined
                                ? null
                                : docs.find(
                                      (d) =>
                                          d.type === "language" &&
                                          (d as { languageCode?: string }).languageCode === lang,
                                  );
                        const langId = langDoc ? (langDoc._id as string) : undefined;
                        const match = docs.find(
                            (d) =>
                                d.type === "content" &&
                                d.parentId === parent &&
                                (langId === undefined || d.language === langId),
                        );
                        resolve((match ?? null) as T | null);
                    };
                };
            }),
        { dbName: DB_NAME, parent: parentId, lang: languageCode },
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
