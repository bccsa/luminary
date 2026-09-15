import {
    computed,
    getCurrentScope,
    onScopeDispose,
    ref,
    shallowRef,
    watch,
    type ComputedRef,
    type ShallowRef,
    type WatchStopHandle,
} from "vue";
import type { BaseDocumentDto, Uuid } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { useHasLocalChanges } from "../useHasLocalChange";
import type { HybridQueryOptions } from "./options";
import { QuerySession } from "./querySession";
import { createBrowserCapabilities } from "./browserCapabilities";
import { resetQueryTransport } from "./querySources";
export {
    DEFAULT_REMOTE_QUERY_LIMIT,
    initHybridQuery,
    queryLocal,
    queryRemote,
} from "./querySources";
export type { HybridQueryOptions } from "./options";

const testInstances = new Set<{ dispose(): void }>();
/** @internal Preserves the existing test reset and production guard. */
export function _resetHybridQueryForTests(): void {
    if (import.meta.env?.MODE !== "test")
        throw new Error("_resetHybridQueryForTests is only available in test mode");
    resetQueryTransport();
    Array.from(testInstances).forEach((query) => query.dispose());
    testInstances.clear();
}

/**
 * Local-first reactive query that merges Dexie (the local IndexedDB cache) with
 * an API supplement, given a configured content publishDate cutoff.
 *
 * Owns its data, its reconnect watcher, its live subscriptions (in live mode: the
 * Dexie `liveQuery` and the Socket.io listener), and its teardown — one instance
 * per query. Most callers should use the {@link useHybridQuery} composable, which
 * constructs this class and returns just `output`; construct the class directly
 * only when you need a manual `dispose()` handle.
 *
 * ```ts
 * const q = new HybridQuery<ContentDto>({
 *     selector: { ... },
 *     $sort: [{ publishDate: "desc" }],
 *     $limit: 10,
 * });
 * // template binds to q.output.value
 * // q.dispose() runs automatically on component unmount when constructed
 * // inside a Vue effect scope (<script setup>); call it manually otherwise.
 * //
 * // Pass { live: true } to keep BOTH sources reactive: the local Dexie source
 * // (re-emits on every IndexedDB change) and the remote supplement (Socket.io
 * // live updates). The default is one-shot.
 * ```
 *
 * **Reactive queries (dependency tracking).** A `() => MangoQuery` **thunk** is
 * reactive — read `ref.value` directly inside it and the query rebuilds when any
 * ref it reads changes. This is **independent of `live`**: the thunk decides *when
 * the query is rebuilt*; `live` decides *how the data stays fresh*.
 *
 * | query form | `live: false` (one-shot) | `live: true` |
 * | --- | --- | --- |
 * | static `MangoQuery` | read once | live Dexie + socket; **query fixed** |
 * | `() => MangoQuery` thunk | **re-query on each dep change** (snapshot) | live **+ dependency tracking** |
 *
 * The refs the thunk reads are auto-tracked (no `deps` array; a serialized-query
 * compare dedupes no-op changes). Each dep change rebuilds the local read, and (in
 * live mode) the API POST + socket predicates, discarding in-flight POSTs from the
 * previous query. In **one-shot** mode a thunk re-queries on each change but is a
 * snapshot between changes (no liveQuery/socket). A rebuild clears `output` unless the
 * caller opted into `keepPreviousResult: true` (a re-narrowed list). The thunk must be
 * **pure** (it is called more than once per change). See the README "Reactive queries"
 * section.
 *
 * ```ts
 * // reactive: rebuilds whenever pinnedCats changes
 * const q = new HybridQuery<ContentDto>(
 *     () => ({ selector: { parentTags: { $elemMatch: { $in: pinnedCats.value } } } }),
 *     { live: true },
 * );
 * ```
 *
 * The compatibility facade composes an execution session, a result window,
 * hydration policy and environment adapters. Routing and merge behavior remain
 * centralized in those capabilities; Vue only binds their outputs and lifetime.
 *
 * **Routing:**
 * - `type === "content"` (partially synced): read Dexie, then decide whether to
 *   supplement from the API via the content query planner.
 * - Other types present in `syncList` (fully synced): Dexie only.
 * - Other types not in `syncList`: API only.
 *
 * **Merge semantics:** local + remote are unioned by `_id` with newer
 * `updatedTimeUtc` winning, then re-sorted and re-limited per the query's
 * `$sort`/`$limit`. UNION (not replace) is critical — the remote query may fetch
 * only the older tail, so fresh local docs above the cutoff must be retained.
 * `output` is only reassigned when the windowed result actually changed (compared
 * by `_id` + `updatedTimeUtc`), to avoid needless Vue re-renders.
 *
 * **Live mode (`{ live: true }`):** the local source is read via `useDexieLiveQuery`
 * (re-emits on every IndexedDB change), and the remote contribution is kept live by
 * a Socket.io listener that filters the global access-scoped changefeed with a
 * predicate compiled from the supplement query. The supplement POST stays one-shot;
 * reconnect only re-attaches the listener (no re-fetch). See the README for the
 * shortcomings (offline-gap healing, delete-predicate fidelity, tombstones).
 *
 * **Offline:** if `isConnected` is false when the supplement POST is needed, the
 * class watches the connection and fires it once it becomes true (run-once). The
 * watcher is registered for teardown on `dispose()`.
 */
export class HybridQuery<T extends BaseDocumentDto = BaseDocumentDto> {
    public readonly output: ShallowRef<T[]>;
    /** Initial local/remote work is pending; offline deferral counts as settled. */
    public readonly isFetching: ComputedRef<boolean>;
    /** Last exposed error for this generation; reset on query rebuild. */
    public readonly error: ShallowRef<unknown | undefined>;
    /** Existing application-lifetime pending-edit lookup. */
    public readonly hasLocalChanges: ComputedRef<(id: Uuid) => boolean>;
    private readonly session: Pick<QuerySession<T>, "rebuild" | "dispose">;
    private stopQueryWatch?: WatchStopHandle;

    constructor(query: MangoQuery | (() => MangoQuery), options: HybridQueryOptions = {}) {
        const queryFn = typeof query === "function" ? query : () => query;
        const localPending = ref(false);
        const remotePending = ref(false);
        this.output = shallowRef<T[]>([]);
        this.error = shallowRef<unknown | undefined>(undefined);
        this.isFetching = computed(() => localPending.value || remotePending.value);
        this.hasLocalChanges = useHasLocalChanges();
        this.session = new QuerySession(queryFn, options, createBrowserCapabilities<T>(options), {
            publish: (docs) => {
                this.output.value = docs;
            },
            pending: ({ local, remote }) => {
                localPending.value = local;
                remotePending.value = remote;
            },
            error: (error) => {
                this.error.value = error;
            },
        });
        if (getCurrentScope()) onScopeDispose(() => this.dispose());
        if (import.meta.env?.MODE === "test") testInstances.add(this);
        if (typeof query === "function") {
            this.stopQueryWatch = watch(
                () => JSON.stringify(queryFn(), (_k, v) => (v === undefined ? "\u0000undef" : v)),
                () => this.session.rebuild(queryFn()),
                { immediate: true },
            );
        } else {
            this.session.rebuild(queryFn());
        }
    }

    dispose(): void {
        if (import.meta.env?.MODE === "test") testInstances.delete(this);
        this.stopQueryWatch?.();
        this.session.dispose();
    }
}
