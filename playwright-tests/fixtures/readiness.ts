import type { Page } from "@playwright/test";

const DEFAULT_TIMEOUT = 30_000;
const POLL_INTERVAL = 250;

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
    // Safe as a waitForFunction predicate because it is synchronous; see the
    // note on waitForSynced for why an async one would not be.
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

const EMPTY: SyncedSummary = { groups: [], types: [], statuses: [] };

/**
 * Summarises every doc on the device. The IndexedDB handle is cached on
 * `window` so repeated reads do not reopen the connection.
 */
async function collectSynced(dbName: string): Promise<SyncedSummary> {
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

    return {
        groups: [...new Set(docs.flatMap((d) => d.memberOf ?? []))],
        types: [...new Set(docs.map((d) => d.type).filter(Boolean) as string[])],
        statuses: [...new Set(docs.map((d) => d.status).filter(Boolean) as string[])],
    };
}

/** Everything currently on the device, without waiting for anything in particular. */
export async function readSynced(page: Page): Promise<SyncedSummary> {
    return page.evaluate(collectSynced, DB_NAME);
}

/**
 * Resolves once everything named in `expected` has reached the device. Assert an
 * absence only after this has confirmed sync actually ran — otherwise the
 * assertion passes against an empty database and proves nothing.
 *
 * Polled from here rather than through `page.waitForFunction`, which treats the
 * promise an async predicate returns as an immediately truthy result and so
 * would not wait at all. Reading IndexedDB requires an async predicate.
 */
export async function waitForSynced(
    page: Page,
    expected: SyncedExpectation,
    options?: { timeout?: number },
): Promise<SyncedSummary> {
    const groups = expected.groups ?? [];
    const types = expected.types ?? [];
    const deadline = Date.now() + (options?.timeout ?? DEFAULT_TIMEOUT);

    let seen: SyncedSummary = EMPTY;
    for (;;) {
        seen = await readSynced(page);
        const satisfied =
            groups.every((group) => seen.groups.includes(group)) &&
            types.every((type) => seen.types.includes(type));
        if (satisfied) return seen;
        if (Date.now() >= deadline) break;
        await page.waitForTimeout(POLL_INTERVAL);
    }

    throw new Error(
        `Timed out waiting for sync. Expected groups [${groups.join(", ")}] and ` +
            `types [${types.join(", ")}]; saw groups [${seen.groups.join(", ")}] and ` +
            `types [${seen.types.join(", ")}].`,
    );
}
