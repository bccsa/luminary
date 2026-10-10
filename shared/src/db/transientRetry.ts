/** How long to wait before retrying a Dexie op that failed on a transient IndexedDB error. */
const TRANSIENT_INDEXEDDB_RETRY_DELAY_MS = 100;

/**
 * WebKit aborts or closes an in-flight IndexedDB transaction when the tab is
 * backgrounded or put under memory pressure, which Dexie surfaces as one of these
 * names/messages rather than as data loss. They're transient — the transaction
 * reopens once the tab is foregrounded again — so callers get one retry instead
 * of treating the first failure as final.
 */
export function isTransientIndexedDbError(err: unknown): boolean {
    // Duck-typed, not `instanceof Error`: a real DOMException (AbortError,
    // UnknownError) does NOT extend Error in browsers, only Dexie's own
    // BulkError does.
    if (!err || typeof err !== "object") return false;
    const { name, message } = err as { name?: unknown; message?: unknown };
    if (name === "AbortError") return true;
    // Covers both a direct UnknownError and a Dexie BulkError, whose `.message`
    // embeds the nested per-op error text.
    return (
        typeof message === "string" &&
        /in-progress transaction|cursor that doesn't exist/i.test(message)
    );
}

/** Runs `op`, retrying it once after a short delay if it fails on a transient IndexedDB error. */
export async function retryOnTransientIndexedDbError<T>(op: () => Promise<T>): Promise<T> {
    try {
        return await op();
    } catch (err) {
        if (!isTransientIndexedDbError(err)) throw err;
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_INDEXEDDB_RETRY_DELAY_MS));
        return op();
    }
}
