import { effectScope, type EffectScope, type ShallowRef } from "vue";
import { db, useDexieLiveQuery, type BaseDocumentDto, type DocType } from "luminary-shared";

// One shared live query per DocType. Many components read the same reference lists (groups, auth
// providers, languages, storages); without sharing, each consumer spins up its own Dexie liveQuery
// and re-reads IndexedDB. Memoizing here means the DB is read once per type and the single live
// result is handed to every caller.
//
// Backed by useDexieLiveQuery (pure Dexie), NOT useHybridQuery, on purpose: these are all
// fully-synced types, so the read is always Dexie-first anyway. HybridQuery decides Dexie-vs-API
// routing once when the query is built (via the sync engine's syncList); a synced query created
// before sync has registered its type — e.g. the Language query that globalConfig.initLanguage()
// creates at startup, before initSync() — would lock into API-only mode and never read Dexie. A
// plain Dexie live query has no such routing and works regardless of when it's created.
const cache = new Map<DocType, { scope: EffectScope; ref: ShallowRef<unknown[]> }>();

/**
 * Shared, live list of all documents of one type (Dexie live query). The query is created once
 * per type — inside a detached effect scope so it is NOT disposed when the first consuming
 * component unmounts — and reused by every caller, so the DB is read once, not once per consumer.
 *
 * Use only for fully-synced reference-data lists read in many places.
 */
export function useDocsByType<T extends BaseDocumentDto = BaseDocumentDto>(
    type: DocType,
): ShallowRef<T[]> {
    let entry = cache.get(type);
    if (!entry) {
        // Detached scope: the live query owns app-lifetime state and must not be torn down when
        // the first consuming component unmounts (it's shared).
        const scope = effectScope(true);
        const ref = scope.run(() =>
            useDexieLiveQuery(
                () => db.docs.where("type").equals(type).toArray() as unknown as Promise<T[]>,
                { initialValue: [] as T[] },
            ),
        ) as ShallowRef<unknown[]>;
        entry = { scope, ref };
        cache.set(type, entry);
    }
    return entry.ref as ShallowRef<T[]>;
}
