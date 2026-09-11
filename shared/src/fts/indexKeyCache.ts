import Dexie from "dexie";
import { db } from "../db/database";

const MAX_ENTRIES = 500;

let cache = new Map<string, Promise<string[]>>();
let subscribed = false;

/**
 * Primary keys read from a `docs` index range, kept until the docs table next changes. A burst of
 * searches reads the same ranges again and again (a trigram's docs, a language's docs), and
 * IndexedDB walks every entry of a range to return its keys.
 */
export function cachedPrimaryKeys(
    key: string,
    read: () => PromiseLike<unknown[]>,
): Promise<string[]> {
    if (!subscribed) {
        subscribed = true;
        // Fires for writes from this tab and from other tabs of the same origin.
        Dexie.on("storagemutated", (parts) => {
            const prefix = `idb://${db.name}/docs/`;
            if (Object.keys(parts).some((part) => part.startsWith(prefix))) cache = new Map();
        });
    }

    let hit = cache.get(key);
    if (!hit) {
        if (cache.size >= MAX_ENTRIES) cache = new Map();
        const owner = cache;
        hit = Promise.resolve(read()) as Promise<string[]>;
        hit.catch(() => owner.delete(key));
        cache.set(key, hit);
    }
    return hit;
}
