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

export type FtsLiveSyncOptions = {
    docType: DocType;
    /** Re-query Dexie for current result ids and prune when docs vanish (local FTS path). */
    watchDexie?: boolean;
};

type FtsLiveSyncAdapter<T> = {
    getId: (item: T) => string;
    patch: (item: T, doc: Partial<BaseDocumentDto>) => T;
};

/**
 * Keep in-memory FTS search results aligned with live doc changes.
 *
 * Subscribes to the same Socket.io `data` feed HybridQuery uses: `DeleteCmd`s and
 * `deleteReq` upserts evict matching rows; other upserts patch rows already shown.
 * Optionally watches Dexie for result ids that disappear locally (CMS content FTS).
 */
export function attachFtsLiveSync<T>(
    results: Ref<T[]>,
    adapter: FtsLiveSyncAdapter<T>,
    options: FtsLiveSyncOptions,
): void {
    if (!getCurrentScope()) return;

    const { docType, watchDexie = false } = options;
    const { getId, patch } = adapter;

    const pruneIds = (ids: Iterable<string>) => {
        const drop = new Set(ids);
        if (!drop.size || !results.value.length) return;
        const next = results.value.filter((item) => !drop.has(getId(item)));
        if (next.length !== results.value.length) results.value = next;
    };

    const applySocketBatch = (data: ApiDataResponseDto) => {
        if (!results.value.length) return;

        // FTS pages are a display-only snapshot — only evict/patch rows we are already
        // showing. New matches are left to the next search (no client-side re-ranking).
        const inResults = new Set(results.value.map(getId));
        const toDrop = new Set<string>();
        const patches: Array<{ id: string; doc: Partial<BaseDocumentDto> }> = [];

        for (const doc of data.docs) {
            if (doc.type === DocType.DeleteCmd) {
                const cmd = doc as DeleteCmdDto;
                if (cmd.docType !== docType || !inResults.has(cmd.docId)) continue;
                // Same gate HybridQuery uses — e.g. CMS keeps status-change deletes local.
                if (db.validateDeleteCommand(cmd)) toDrop.add(cmd.docId);
            } else if (doc.type === docType && doc._id && inResults.has(doc._id)) {
                // deleteReq can arrive before the DeleteCmd (or for types that never sync cmd).
                if ((doc as BaseDocumentDto).deleteReq) toDrop.add(doc._id);
                else patches.push({ id: doc._id, doc });
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
            if (missing.length) pruneIds(missing);

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
