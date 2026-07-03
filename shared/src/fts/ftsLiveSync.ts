import {
    computed,
    effectScope,
    getCurrentScope,
    onScopeDispose,
    watch,
    type Ref,
} from "vue";
import { getSocket, isConnected } from "../socket/socketio";
import { db } from "../db/database";
import {
    DocType,
    type ApiDataResponseDto,
    type BaseDocumentDto,
    type DeleteCmdDto,
} from "../types";
import { useDexieLiveQuery } from "../util/useDexieLiveQuery/useDexieLiveQuery";
import { ftsMightMatchQuery } from "./ftsMightMatchQuery";

export type FtsLiveSyncOptions = {
    docType: DocType;
    /** Re-query Dexie for current result ids and prune when docs vanish (local FTS path). */
    watchDexie?: boolean;
    /**
     * When {@link watchDexie} is enabled, prune result rows whose ids are absent from Dexie
     * only while this is true. Use for hybrid search: API results may reference docs not
     * stored locally (below the sync cutoff) — do not drop those when source is `"api"`.
     */
    dexiePrune?: Ref<boolean> | (() => boolean);
    /** When set, new plausible matches flag results as stale (Option B refresh banner). */
    stale?: Ref<boolean>;
    /** Active search query — used with {@link ftsMightMatchQuery} for stale detection. */
    query?: Ref<string>;
    /** Strict substring match for stale heuristic; false = fuzzy/content related mode. */
    strictMatch?: Ref<boolean> | (() => boolean);
};

type FtsLiveSyncAdapter<T> = {
    getId: (item: T) => string;
    patch: (item: T, doc: Partial<BaseDocumentDto>) => T;
};

/** Mark FTS results stale so the UI can offer a refresh (e.g. after local create). */
export function markFtsStale(stale: Ref<boolean>): void {
    stale.value = true;
}

function readStrict(strictMatch?: Ref<boolean> | (() => boolean)): boolean {
    if (strictMatch === undefined) return true;
    return typeof strictMatch === "function" ? strictMatch() : strictMatch.value;
}

function readFlag(flag?: Ref<boolean> | (() => boolean), defaultValue = true): boolean {
    if (flag === undefined) return defaultValue;
    return typeof flag === "function" ? flag() : flag.value;
}

/**
 * Keep in-memory FTS search results aligned with live doc changes.
 *
 * Subscribes to the same Socket.io `data` feed HybridQuery uses: `DeleteCmd`s and
 * `deleteReq` upserts evict matching rows; other upserts patch rows already shown.
 * New docs that might match the active query set {@link FtsLiveSyncOptions.stale}.
 * Optionally watches Dexie for result ids that disappear locally (CMS content FTS).
 */
export function attachFtsLiveSync<T>(
    results: Ref<T[]>,
    adapter: FtsLiveSyncAdapter<T>,
    options: FtsLiveSyncOptions,
): void {
    if (!getCurrentScope()) return;

    const { docType, watchDexie = false, dexiePrune, stale, query, strictMatch } = options;
    const { getId, patch } = adapter;

    const pruneIds = (ids: Iterable<string>) => {
        const drop = new Set(ids);
        if (!drop.size || !results.value.length) return;
        const next = results.value.filter((item) => !drop.has(getId(item)));
        if (next.length !== results.value.length) results.value = next;
    };

    const applySocketBatch = (data: ApiDataResponseDto) => {
        const inResults = new Set(results.value.map(getId));
        const toDrop = new Set<string>();
        const patches: Array<{ id: string; doc: Partial<BaseDocumentDto> }> = [];
        const q = query?.value.trim() ?? "";

        for (const doc of data.docs) {
            if (doc.type === DocType.DeleteCmd) {
                const cmd = doc as DeleteCmdDto;
                if (cmd.docType !== docType || !inResults.has(cmd.docId)) continue;
                // Same gate HybridQuery uses — e.g. CMS keeps status-change deletes local.
                if (db.validateDeleteCommand(cmd)) toDrop.add(cmd.docId);
            } else if (doc.type === docType && doc._id) {
                // Server-only fields (fts/ftsTokenCount are never for display, per stripExpiredContent's
                // KEEP_FIELDS convention) — strip before this doc can patch a display-bound result row.
                // The raw socket push otherwise reintroduces them into rows a read-time projection
                // (e.g. useContentBrowseQuery's STRIP_FIELDS) already stripped.
                const cleanDoc: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
                delete cleanDoc.fts;
                delete cleanDoc.ftsTokenCount;

                if (inResults.has(doc._id)) {
                    // deleteReq can arrive before the DeleteCmd (or for types that never sync cmd).
                    if ((doc as BaseDocumentDto).deleteReq) toDrop.add(doc._id);
                    else patches.push({ id: doc._id, doc: cleanDoc as Partial<BaseDocumentDto> });
                } else if (
                    stale &&
                    q.length >= 3 &&
                    !(doc as BaseDocumentDto).deleteReq &&
                    ftsMightMatchQuery(q, docType, doc, { strict: readStrict(strictMatch) })
                ) {
                    // New doc not in the snapshot — flag refresh instead of client-side insert.
                    stale.value = true;
                }
            }
        }

        if (toDrop.size) pruneIds(toDrop);

        if (!patches.length) return;

        const byId = new Map(results.value.map((item) => [getId(item), item]));
        let changed = false;
        for (const { id, doc } of patches) {
            const prev = byId.get(id);
            if (!prev) continue;
            const next = patch(prev, doc);
            if (next !== prev) {
                byId.set(id, next);
                changed = true;
            }
        }
        if (changed) results.value = results.value.map((item) => byId.get(getId(item)) ?? item);
    };

    const onData = (data: ApiDataResponseDto) => applySocketBatch(data);

    const stopSocketWatch = watch(
        isConnected,
        (online) => {
            // off-before-on: stable handler ref, no duplicate listeners on reconnect.
            getSocket().off("data", onData);
            if (online) getSocket().on("data", onData);
        },
        { immediate: true },
    );

    onScopeDispose(() => {
        stopSocketWatch();
        getSocket().off("data", onData);
    });

    if (!watchDexie) return;

    // Isolated scope so the Dexie subscription is torn down with the composable.
    const scope = effectScope(true);
    onScopeDispose(() => scope.stop());

    scope.run(() => {
        const resultIds = computed(() => results.value.map(getId).filter(Boolean));

        const liveDocs = useDexieLiveQuery(
            async () => {
                const ids = resultIds.value;
                if (!ids.length) return [] as BaseDocumentDto[];
                return (await db.docs.where("_id").anyOf(ids).toArray()) as BaseDocumentDto[];
            },
            { deps: [resultIds] },
        );

        watch(liveDocs, (docs) => {
            // undefined = liveQuery hasn't emitted yet; don't treat that as "all deleted".
            if (docs === undefined || !results.value.length) return;

            const liveById = new Map((docs ?? []).map((d) => [d._id, d]));
            const missing = resultIds.value.filter((id) => !liveById.has(id));
            if (missing.length && readFlag(dexiePrune)) pruneIds(missing);

            // Covers local edits that land in Dexie before (or without) a socket push.
            let changed = false;
            const next = results.value.map((item) => {
                const live = liveById.get(getId(item));
                if (!live) return item;
                const patched = patch(item, live);
                if (patched !== item) {
                    changed = true;
                    return patched;
                }
                return item;
            });
            if (changed) results.value = next;
        });
    });
}
