import { computed, effectScope, ref, watch, type EffectScope, type Ref } from "vue";
import { openDatabase } from "../db/database";
import { useDexieLiveQuery } from "../util";
import type { BaseDocumentDto, LocalChangeDto, DocType } from "../types";
import { dataSources, isConnected } from "../socket/socketio";
import { sync } from "./sync";
import { syncLocalChanges, type SyncLocalChangesHandle } from "./syncLocalChanges";
import type { SyncListEntry, SyncSource } from "./sync/types";
import { reportError } from "../diagnostics";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type DataSourceConfig = {
    /** Wire name sent to the API. */
    name: string;
    /** Local IndexedDB database name for this source. */
    databaseName: string;
    /** Sync cursor storage key for this source. */
    syncListKey: string;
    /** Optional docs index extension. */
    docsIndex?: string;
    /** Sync runner options, minus source. */
    sync: {
        type: DocType;
        subType?: DocType;
        memberOf?: string[];
        languages?: string[];
        publishDateMin?: number;
        publishDateMax?: number;
        limit: number;
        cms?: boolean;
    };
    /** Optional extra readiness gate from callers (for consent/session state). */
    ready?: Ref<boolean>;
    /** Optional pacing between queued uploads while backlog exists. */
    paceMs?: number;
};

export type DataSourceHandle = {
    db: Awaited<ReturnType<typeof openDatabase>>;
    pending: Ref<number>;
    ready: Ref<boolean>;
    pull: () => Promise<void>;
    flush: (timeoutMs?: number) => Promise<boolean>;
    clear: () => Promise<void>;
    dispose: () => Promise<void>;
};

/**
 * Create a source-scoped queue+pull orchestrator.
 */
export async function createDataSource(config: DataSourceConfig): Promise<DataSourceHandle> {
    const sourceDb = await openDatabase({
        name: config.databaseName,
        docsIndex: config.docsIndex,
        syncListKey: config.syncListKey,
        requestPersistentStorage: false,
        includeUserActivityTable: false,
        quietAcks: true,
    });

    const syncList = ref<SyncListEntry[]>([]);
    await sourceDb.getSyncList(syncList);
    const clearing = ref(false);
    let generation = 0;
    let disposed = false;

    const putPulledDocs = async (docs: BaseDocumentDto[], isCancelled = () => false) => {
        // Check cancellation inside the transaction too: a clear may precede its start.
        await sourceDb.transaction("rw", sourceDb.docs, sourceDb.localChanges, async () => {
            if (isCancelled()) return;
            const queued = await sourceDb.localChanges.toArray();
            const queuedDocIds = new Set(queued.map((c) => c.docId));
            const filtered = docs.filter((doc) => !queuedDocIds.has(doc._id));
            if (filtered.length > 0) {
                await sourceDb.bulkPut(filtered);
            }
        });
    };

    const source: SyncSource = {
        name: config.name,
        syncList,
        setSyncList: () => sourceDb.setSyncList(syncList).then(() => undefined),
        put: (docs) => putPulledDocs(docs),
    };

    const advertised = computed(() => dataSources.value.includes(config.name));
    const ready = computed(
        () => !clearing.value && !disposed && advertised.value && (config.ready?.value ?? true),
    );

    const scope: EffectScope = effectScope(true);
    const pending = ref(0);

    let localChangesRef: Ref<LocalChangeDto[]> | undefined;
    let syncHandle: SyncLocalChangesHandle | undefined;
    let pullInFlight: Promise<void> | null = null;
    let pullQueued = false;

    const runPull = async (): Promise<void> => {
        if (disposed || clearing.value) return;
        syncHandle?.restart();
        if (pullInFlight) {
            pullQueued = true;
            return pullInFlight;
        }

        pullInFlight = (async () => {
            do {
                pullQueued = false;
                if (!isConnected.value || !ready.value) return;
                if ((await sourceDb.localChanges.count()) > 0) return;

                const pullGeneration = generation;
                const isCancelled = () =>
                    disposed || pullGeneration !== generation || !isConnected.value || !ready.value;
                await sync({
                    type: config.sync.type,
                    subType: config.sync.subType,
                    memberOf: config.sync.memberOf ?? ["*"],
                    languages: config.sync.languages,
                    publishDateMin: config.sync.publishDateMin,
                    publishDateMax: config.sync.publishDateMax,
                    limit: config.sync.limit,
                    cms: config.sync.cms,
                    source: {
                        ...source,
                        isCancelled,
                        put: (docs) => putPulledDocs(docs, isCancelled),
                    },
                });
            } while (pullQueued);
        })();

        try {
            await pullInFlight;
        } finally {
            pullInFlight = null;
        }
    };

    scope.run(() => {
        localChangesRef = useDexieLiveQuery(
            () => sourceDb.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            { initialValue: [] as unknown as LocalChangeDto[] },
        );

        syncHandle = syncLocalChanges(localChangesRef, {
            targetDb: sourceDb,
            dataSource: config.name,
            ready,
            quiet: true,
            paceMs: config.paceMs ?? 0,
        });

        watch(
            [isConnected, ready, () => localChangesRef!.value.length],
            ([connected, sourceReady, queued]) => {
                pending.value = queued;
                if (connected && sourceReady && queued === 0) {
                    void runPull().catch((err) => {
                        reportError(err, {
                            area: "dataSource",
                            op: "auto-pull",
                            data: { source: config.name },
                        });
                    });
                }
            },
            { immediate: true },
        );
    });

    const foregroundPull = () => {
        if (document.visibilityState === "visible") {
            void runPull().catch((err) => {
                reportError(err, {
                    area: "dataSource",
                    op: "foreground-pull",
                    data: { source: config.name },
                });
            });
        }
    };
    if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", foregroundPull);
    }

    return {
        db: sourceDb,
        pending,
        ready,
        pull: runPull,
        flush: async (timeoutMs = 5000) => {
            if (disposed || clearing.value) return false;
            syncHandle?.restart();
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                if ((await sourceDb.localChanges.count()) === 0) return true;
                if (!isConnected.value || !ready.value) return false;
                await wait(50);
            }
            return (await sourceDb.localChanges.count()) === 0;
        },
        clear: async () => {
            clearing.value = true;
            generation++;
            try {
                await sourceDb.clear();
                syncList.value = [];
                await sourceDb.setSyncList(syncList);
            } finally {
                clearing.value = false;
            }
        },
        dispose: async () => {
            disposed = true;
            generation++;
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", foregroundPull);
            }
            await syncHandle?.stop();
            await pullInFlight?.catch(() => undefined);
            scope.stop();
            sourceDb.close();
        },
    };
}
