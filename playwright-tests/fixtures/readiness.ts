import type { Page } from "@playwright/test";

/**
 * Waits are evaluated inside the page so the whole wait costs one round trip
 * instead of one per attempt, and the IndexedDB connection is opened once and
 * cached on `window` rather than reopened on every poll.
 */

const DEFAULT_TIMEOUT = 30_000;

/** Key `luminary-shared` mirrors the socket handshake's AccessMap into. */
const ACCESS_MAP_KEY = "accessMap";

/** Dexie database both clients sync into. */
const DB_NAME = "luminary-db";

export type AccessMap = Record<string, Record<string, Record<string, boolean>>>;

export async function readAccessMap(page: Page): Promise<AccessMap> {
    return page.evaluate((key) => {
        try {
            return JSON.parse(localStorage.getItem(key) ?? "{}");
        } catch {
            return {};
        }
    }, ACCESS_MAP_KEY);
}

/**
 * Resolves once the API has delivered an AccessMap. This is the earliest point
 * at which a permission assertion is meaningful — asserting before it passes
 * vacuously against an empty map.
 */
export async function waitForAccessMap(
    page: Page,
    options?: { timeout?: number },
): Promise<AccessMap> {
    await page.waitForFunction(
        (key) => {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return false;
                return Object.keys(JSON.parse(raw)).length > 0;
            } catch {
                return false;
            }
        },
        ACCESS_MAP_KEY,
        { timeout: options?.timeout ?? DEFAULT_TIMEOUT },
    );
    return readAccessMap(page);
}

/** What reached the device, summarised across every synced document. */
export type SyncedSummary = {
    groups: string[];
    types: string[];
    statuses: string[];
};

export type SyncedExpectation = {
    groups?: string[];
    types?: string[];
};

/**
 * Summarises every doc on the device, returning it only once `expected` is fully
 * present. Returning null while unsatisfied lets the same function serve
 * `page.evaluate` for a plain read (with no expectation) and
 * `page.waitForFunction` for a wait.
 */
async function collectSynced({
    dbName,
    expected,
}: {
    dbName: string;
    expected: Required<SyncedExpectation>;
}): Promise<SyncedSummary | null> {
    const scope = window as unknown as { __e2eDb?: IDBDatabase };

    const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(dbName);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });

    const readAll = (db: IDBDatabase) =>
        new Promise<Array<{ memberOf?: string[]; type?: string; status?: string }>>(
            (resolve, reject) => {
                const all = db.transaction("docs", "readonly").objectStore("docs").getAll();
                all.onerror = () => reject(all.error);
                all.onsuccess = () => resolve(all.result);
            },
        );

    if (!scope.__e2eDb) scope.__e2eDb = await open();

    let docs: Array<{ memberOf?: string[]; type?: string; status?: string }>;
    try {
        docs = await readAll(scope.__e2eDb);
    } catch {
        // A version change or a closed connection invalidates the handle.
        scope.__e2eDb = await open();
        docs = await readAll(scope.__e2eDb);
    }

    const summary: SyncedSummary = {
        groups: [...new Set(docs.flatMap((d) => d.memberOf ?? []))],
        types: [...new Set(docs.map((d) => d.type).filter(Boolean) as string[])],
        statuses: [...new Set(docs.map((d) => d.status).filter(Boolean) as string[])],
    };

    const satisfied =
        expected.groups.every((group) => summary.groups.includes(group)) &&
        expected.types.every((type) => summary.types.includes(type));

    return satisfied ? summary : null;
}

const NOTHING_EXPECTED = { groups: [], types: [] };

/** Everything currently on the device, without waiting for anything in particular. */
export async function readSynced(page: Page): Promise<SyncedSummary> {
    const summary = await page.evaluate(collectSynced, {
        dbName: DB_NAME,
        expected: NOTHING_EXPECTED,
    });
    return summary ?? { groups: [], types: [], statuses: [] };
}

/**
 * Resolves once everything named in `expected` has reached the device. Assert an
 * absence only after this has confirmed sync actually ran — otherwise the
 * assertion passes against an empty database and proves nothing.
 */
export async function waitForSynced(
    page: Page,
    expected: SyncedExpectation,
    options?: { timeout?: number },
): Promise<SyncedSummary> {
    const required = { groups: expected.groups ?? [], types: expected.types ?? [] };

    try {
        const handle = await page.waitForFunction(
            collectSynced,
            { dbName: DB_NAME, expected: required },
            { timeout: options?.timeout ?? DEFAULT_TIMEOUT, polling: 250 },
        );
        return (await handle.jsonValue()) ?? (await readSynced(page));
    } catch {
        const seen = await readSynced(page);
        throw new Error(
            `Timed out waiting for sync. Expected groups [${required.groups.join(", ")}] ` +
                `and types [${required.types.join(", ")}]; saw groups [${seen.groups.join(
                    ", ",
                )}] ` +
                `and types [${seen.types.join(", ")}].`,
        );
    }
}
