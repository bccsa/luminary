import {
    effectScope,
    getCurrentScope,
    onScopeDispose,
    shallowRef,
    watch,
    type ShallowRef,
} from "vue";
import { db } from "../../db/database";
import { HttpReq } from "../../rest/http";
import { getSocket, isConnected } from "../../socket/socketio";
import {
    type ApiDataResponseDto,
    type BaseDocumentDto,
    type DeleteCmdDto,
    DocType,
} from "../../types";
import { mangoCompile } from "../MangoQuery/mangoCompile";
import { mangoToDexie } from "../MangoQuery/mangoToDexie";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { useDexieLiveQuery } from "../useDexieLiveQuery/useDexieLiveQuery";
import { applySortLimit, mergeById, sameWindow } from "./mergeDocs";
import {
    decideContentApiQuery,
    readType,
    toDeleteSelector,
    typeIsInSyncList,
} from "./queryIntrospection";

/**
 * Cap for remote (`/query`) responses when the caller omits `$limit`. Prevents an
 * unbounded query from accidentally downloading and parsing tens of MB of JSON on
 * low-end devices or metered connections. Callers that actually need more must
 * pass `$limit` explicitly.
 */
export const DEFAULT_REMOTE_QUERY_LIMIT = 500;

let _httpService: HttpReq<any> | undefined;

/**
 * Wire the HTTP service used by `HybridQuery` / `postQuery` for the remote path.
 * Called once at app startup from `shared/src/luminary.ts`, alongside `initSync`.
 */
export function initHybridQuery(httpService: HttpReq<any>): void {
    _httpService = httpService;
}

/**
 * @internal Reset the configured HTTP service. Exposed for tests only — guarded
 * so a production bundle can't be coerced into nulling the HTTP service (which
 * would break the remote path). Not re-exported from the module index.
 */
export function _resetHybridQueryForTests(): void {
    if (import.meta.env?.MODE !== "test") {
        throw new Error("_resetHybridQueryForTests is only available in test mode");
    }
    _httpService = undefined;
}

/**
 * POST a MangoQuery to the `/query` endpoint and return its docs. Bare network
 * call — no local read, no merging. Applies the remote `$limit` cap
 * (`DEFAULT_REMOTE_QUERY_LIMIT`) when the query omits one. Throws if
 * `initHybridQuery` has not wired an HTTP service — a programmer error, not a
 * runtime condition.
 */
export async function postQuery<T = unknown>(query: MangoQuery): Promise<T[]> {
    if (!_httpService) {
        throw new Error(
            "hybridQuery module not initialized with HTTP service. Call initHybridQuery(http) first.",
        );
    }

    const payload: Record<string, unknown> = {
        selector: query.selector,
        identifier: "hybridQuery",
        limit: typeof query.$limit === "number" ? query.$limit : DEFAULT_REMOTE_QUERY_LIMIT,
    };
    if (Array.isArray(query.$sort)) payload.sort = query.$sort;
    // Forward the client-chosen index hint to the API (validated against an
    // allowlist there). Same pattern as sync2/syncBatch.ts — index selection
    // is a client concern.
    if (typeof query.use_index === "string") payload.use_index = query.use_index;

    const res = await _httpService.post("query", payload as any);
    return (res?.docs ?? []) as T[];
}

/** Options for {@link HybridQuery}. */
export type HybridQueryOptions = {
    /**
     * When `true`, the local Dexie source is read **live** — the class subscribes
     * via `useDexieLiveQuery` and re-emits `output` on every IndexedDB change,
     * re-running the same dedup + sort/limit. When `false` (the default) the local
     * source is read **once** (the original one-shot behaviour).
     *
     * The API supplement **POST** is **always one-shot** regardless of this flag
     * (decided once from the first local result). In live mode the remote
     * contribution is additionally kept live by a Socket.io listener; on reconnect
     * that listener re-attaches but the supplement is **not** re-fetched (offline
     * gaps heal on remount). See the module README for the shortcomings.
     */
    live?: boolean;
};

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
 * **Core invariant:** the newest content is always present locally — sync
 * maintains the head of the timeline. The API is only ever needed to supply
 * data that is genuinely not local: older content (`publishDate <= cutoff`),
 * specific missing ids, or non-synced doc types. Every short-circuit in this
 * class (limit satisfied locally, all ids present locally) and the
 * `publishDate <= cutoff` clauses are correct because of this invariant.
 *
 * **Routing:**
 * - `type === "content"` (partially synced): read Dexie, then decide whether to
 *   supplement from the API via {@link decideContentApiQuery}.
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

    private readonly _query: MangoQuery;
    private readonly _limit?: number;
    private readonly _sort?: MangoQuery["$sort"];
    private readonly _live: boolean;
    // The two contributions to `output`, kept separate so live mode can replace
    // the local set wholesale (reflecting deletions) while the one-shot remote
    // supplement persists. `output = applySortLimit(mergeById(_local, _remote))`.
    private _local: T[] = [];
    private _remote: T[] = [];
    // Gates the one-shot API decision to the FIRST local result, in both modes.
    private _apiDecided = false;
    // Live mode only: docIds removed by a socket DeleteCmd → the delete's
    // updatedTimeUtc. `_recompute` suppresses an at-or-older copy that still
    // lingers in a source (e.g. a Dexie `liveQuery` re-emit that fires before the
    // global bulkPut has deleted the doc); the tombstone is released in `_setLocal`
    // once the fresh Dexie read no longer holds a stale copy.
    private readonly _tombstones = new Map<string, number>();
    private readonly _disposers = new Set<() => void>();
    private _disposed = false;

    constructor(query: MangoQuery, options: HybridQueryOptions = {}) {
        this._query = query;
        this._limit = query.$limit;
        this._sort = query.$sort;
        this._live = options.live ?? false;
        this.output = shallowRef<T[]>([]);

        // Auto-teardown on unmount when constructed inside a Vue effect scope
        // (e.g. <script setup>). Vue's withAsyncContext keeps the scope valid
        // across top-level awaits, so this works even when `new HybridQuery(...)`
        // sits after an `await` in the script. A non-component caller will see no
        // active scope and must call `dispose()` manually.
        if (getCurrentScope()) onScopeDispose(() => this.dispose());

        // Kick off the routing. `_run()` wraps its synchronous routing in
        // try/catch, and the per-result async work (local read, POST) carries its
        // own handlers, so a Dexie/postQuery failure cannot surface as an
        // unhandled rejection.
        this._run();
    }

    /**
     * Tear down everything the instance owns: the reconnect watcher, and (in live
     * mode) the Dexie `liveQuery` subscription and the Socket.io listener. Marks
     * the instance dead so any in-flight POST or late socket batch that resolves
     * later won't mutate `output`, and releases references. Idempotent. Called
     * automatically when the owning Vue scope disposes.
     */
    dispose(): void {
        this._disposed = true;
        this._disposers.forEach((fn) => fn());
        this._disposers.clear();
    }

    // ── internals ────────────────────────────────────────────────────────────

    private _run(): void {
        // Outer try/catch guarantees the synchronous routing (readType,
        // typeIsInSyncList, _startLocal / _runApiWhenOnline / _startRemoteLive
        // setup) cannot surface an error to the constructor's `this._run()` call.
        // The per-result work (onLocal / _postAndMerge / the socket callback)
        // carries its own handlers because it runs on a later tick, outside this try.
        try {
            const type = readType(this._query);

            if (type === DocType.Content) {
                // Local read merges instantly; the FIRST local result also drives
                // the (one-shot) API-supplement decision. Later live emissions
                // update `_local` only — the `_apiDecided` gate keeps the API
                // one-shot ("exclude live updates from the API").
                this._startLocal((local) => {
                    try {
                        this._setLocal(local);
                        if (this._apiDecided) return;
                        this._apiDecided = true;
                        const api = decideContentApiQuery(this._query, local);
                        if (api) {
                            void this._runApiWhenOnline(api);
                            // Live mode: keep the remote supplement live off the
                            // socket changefeed, filtered by the supplement query.
                            if (this._live) this._startRemoteLive(api, DocType.Content);
                        }
                    } catch (err) {
                        console.error("[HybridQuery] local update failed:", err);
                    }
                });
                return;
            }

            if (typeIsInSyncList(type)) {
                // Fully-synced type → Dexie only, no API supplement.
                this._startLocal((local) => {
                    try {
                        this._setLocal(local);
                    } catch (err) {
                        console.error("[HybridQuery] local update failed:", err);
                    }
                });
                return;
            }

            // Non-content type not in syncList → fetch from API only, no Dexie read.
            void this._runApiWhenOnline(this._query);
            // Live mode: these docs never flow through Dexie, so the socket
            // listener is their only live path. Filter the feed by the whole query.
            if (this._live) this._startRemoteLive(this._query, type);
        } catch (err) {
            // Belt-and-braces: anything that escaped the inner handlers (the
            // reconnect-watcher setup, an unexpected throw in queryIntrospection
            // helpers, …) is logged here.
            console.error("[HybridQuery] routing failed:", err);
        }
    }

    /**
     * Source the local Dexie docs and hand each result to `onLocal`.
     *
     * - One-shot mode: a single `mangoToDexie` read; on failure, log and call
     *   `onLocal([])` so the content branch still decides the API with an empty
     *   local set (preserves the original behaviour). The two-arg `.then` form
     *   ensures the reject handler only catches the Dexie read — never a throw
     *   from inside `onLocal`.
     * - Live mode: subscribe via `useDexieLiveQuery`, re-invoking `onLocal` on
     *   every IndexedDB change. The composable ties cleanup to the *current* Vue
     *   scope and returns no stop handle, so we run it inside a detached
     *   `effectScope` the class owns — `dispose()` → `scope.stop()` →
     *   `useDexieLiveQuery`'s `onScopeDispose` → `liveQuery` unsubscribe.
     */
    private _startLocal(onLocal: (docs: T[]) => void): void {
        if (!this._live) {
            void mangoToDexie<T>(db.docs, this._query).then(onLocal, (err) => {
                console.error("[HybridQuery] local read failed:", err);
                onLocal([]);
            });
            return;
        }

        const scope = effectScope(true);
        // Register teardown BEFORE running so a throw during setup is still
        // covered by dispose().
        this._disposers.add(() => scope.stop());
        scope.run(() => {
            const source = useDexieLiveQuery<T[]>(
                () => mangoToDexie<T>(db.docs, this._query),
                {
                    onError: (err) =>
                        console.error("[HybridQuery] live local read failed:", err),
                },
            );
            // `immediate: true` fires synchronously with the ref's initial value
            // (`undefined`) — guarded out so we never pass `undefined` to
            // `mergeById` and never decide the API off a synthetic empty snapshot.
            // The first *real* emission is async and drives `onLocal`.
            watch(
                source,
                (docs) => {
                    if (docs === undefined) return;
                    onLocal(docs);
                },
                { immediate: true },
            );
        });
    }

    private async _runApiWhenOnline(api: MangoQuery): Promise<void> {
        if (isConnected.value) {
            await this._postAndMerge(api);
            return;
        }
        // Offline — defer the POST until `isConnected` flips true. Run-once
        // guard makes connection-flapping safe. Stored as a disposer so
        // `dispose()` can cancel a still-pending watcher (e.g. component
        // unmounted before reconnect).
        let ran = false;
        const stop = watch(isConnected, (connected) => {
            if (!connected || ran) return;
            ran = true;
            stop();
            this._disposers.delete(stop);
            void this._postAndMerge(api);
        });
        this._disposers.add(stop);
    }

    private async _postAndMerge(api: MangoQuery): Promise<void> {
        try {
            this._setRemote(await postQuery<T>(api));
        } catch (err) {
            console.error("[HybridQuery] remote query failed:", err);
        }
    }

    /**
     * Live mode only: attach a Socket.io `"data"` listener that keeps the remote
     * contribution live. Filters the global access-scoped changefeed with a
     * predicate compiled from the supplement query: matching docs are upserted into
     * `_remote`, and applicable deletes are removed from `_remote` (a local copy is
     * suppressed via a tombstone instead — see {@link _applySocketData}). This is
     * **listener lifecycle only** — the one-shot supplement POST stays owned by
     * `_runApiWhenOnline`, and we deliberately do **not** re-POST on reconnect
     * (offline gaps are healed on remount — see the README "Shortcomings").
     */
    private _startRemoteLive(api: MangoQuery, queryType: DocType | undefined): void {
        const matchP = mangoCompile(api.selector);
        const deleteP = mangoCompile(toDeleteSelector(api.selector, queryType));
        // Stable reference so off() always matches a prior on() (no dup listeners).
        const cb = (data: ApiDataResponseDto) => this._applySocketData(data, matchP, deleteP);

        const stop = watch(
            isConnected,
            (connected) => {
                if (this._disposed) return;
                // off() first is idempotent and guarantees a single registration.
                getSocket().off("data", cb);
                if (connected) getSocket().on("data", cb);
            },
            { immediate: true },
        );

        this._disposers.add(stop);
        this._disposers.add(() => getSocket().off("data", cb));
    }

    /**
     * Apply one socket `"data"` batch to the remote contribution. Normal docs that
     * pass `matchP` are upserted into `_remote`; `DeleteCmd`s that pass
     * `validateDeleteCommand` + `deleteP` and target a doc we currently hold (newer
     * than our copy) are removed from `_remote` durably, and — if a local copy
     * exists — tombstoned so `_recompute` suppresses it until Dexie catches up
     * (`_local` is **not** filtered here). Recomputes only when the batch touched
     * something.
     */
    private _applySocketData(
        data: ApiDataResponseDto,
        matchP: (doc: any) => boolean,
        deleteP: (doc: any) => boolean,
    ): void {
        if (this._disposed) return;

        const upserts: T[] = [];
        const deleteIds = new Set<string>();

        for (const doc of data.docs) {
            if (doc.type === DocType.DeleteCmd) {
                const cmd = doc as DeleteCmdDto;
                if (!db.validateDeleteCommand(cmd)) continue; // reason / permission / CMS gate
                if (!deleteP(cmd)) continue; // docType / id-list pre-filter
                const cur = this._findById(cmd.docId); // membership = the real gate
                if (!cur || cur.updatedTimeUtc >= cmd.updatedTimeUtc) continue; // stale guard
                deleteIds.add(cmd.docId);
                // A LOCAL copy will be re-emitted by Dexie until it catches up, so a
                // tombstone suppresses the stale copy meanwhile (pruned in
                // `_setLocal`). `_remote` has no external catch-up, so it's filtered
                // durably below — a remote-only delete needs no tombstone.
                if (this._local.some((d) => d._id === cmd.docId)) {
                    this._tombstones.set(cmd.docId, cmd.updatedTimeUtc);
                }
            } else if (matchP(doc)) {
                upserts.push(doc as T);
            }
        }

        // Nothing relevant in this batch → skip the merge/sort/recompute entirely.
        if (upserts.length === 0 && deleteIds.size === 0) return;

        if (upserts.length) this._remote = mergeById(this._remote, upserts);
        // Durable removal from the remote contribution. Local copies are handled by
        // the tombstone (don't filter `_local` here — a filter would let the next
        // Dexie re-emit resurrect the doc with no tombstone left to suppress it).
        if (deleteIds.size) this._remote = this._remote.filter((d) => !deleteIds.has(d._id));
        this._recompute();
    }

    /** First copy of `id` across the remote then local contributions, if any. */
    private _findById(id: string): T | undefined {
        return (
            this._remote.find((d) => d._id === id) ?? this._local.find((d) => d._id === id)
        );
    }

    /** Replace the local contribution (the live emission may have dropped docs). */
    private _setLocal(local: T[]): void {
        // Prune tombstones the fresh Dexie read has caught up on: the id is gone,
        // or present with a copy NEWER than the delete (republished). A still-
        // present at-or-older copy keeps its tombstone so `_recompute` suppresses
        // it. This is where socket-delete tombstones are reliably released.
        if (this._tombstones.size) {
            const release: string[] = [];
            this._tombstones.forEach((ts, id) => {
                const staleStillPresent = local.some(
                    (d) => d._id === id && d.updatedTimeUtc <= ts,
                );
                if (!staleStillPresent) release.push(id);
            });
            release.forEach((id) => this._tombstones.delete(id));
        }
        this._local = local;
        this._recompute();
    }

    /**
     * Merge the remote supplement into `_remote` (union by `_id`, newer wins).
     * Merge — not replace — so a socket upsert that lands BEFORE the one-shot POST
     * resolves is not wiped. One-shot behaviour is unchanged: `_remote` starts
     * `[]`, so the first merge equals the POST result.
     */
    private _setRemote(remote: T[]): void {
        this._remote = mergeById(this._remote, remote);
        this._recompute();
    }

    private _recompute(): void {
        // After dispose(), a late POST or a late live emission must NOT mutate
        // output — the consumer has unmounted and treats the ref as dead.
        if (this._disposed) return;
        // UNION (not replace) across sources — the remote query may fetch only the
        // older tail (publishDate <= cutoff), so fresh local docs above the cutoff
        // must be retained alongside it. Argument order is load-bearing: `_local`
        // seeds and `_remote` layers on top, so the remote copy wins
        // `updatedTimeUtc` ties (identical to the original local-then-remote merge
        // sequence). Do NOT flip the args.
        const merged = mergeById(this._local, this._remote);

        let result = merged;
        if (this._tombstones.size) {
            // Suppress a doc a socket DeleteCmd removed while a stale copy still
            // lingers in a source (e.g. Dexie not yet caught up). A copy NEWER than
            // the delete (republish-after-delete) supersedes the tombstone. Stale
            // tombstones are released in `_setLocal`, not here, so a delete survives
            // recomputes triggered by unrelated changes until Dexie catches up.
            result = merged.filter((d) => {
                const ts = this._tombstones.get(d._id);
                if (ts === undefined) return true;
                if (d.updatedTimeUtc > ts) {
                    this._tombstones.delete(d._id);
                    return true;
                }
                return false;
            });
        }

        const windowed = applySortLimit(result, this._sort, this._limit);
        // Mutate the output ref only when the visible window actually changed —
        // saves a Vue re-render for socket batches (and local emissions) that
        // don't affect the sorted/limited view.
        if (!sameWindow(windowed, this.output.value)) this.output.value = windowed;
    }
}
