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
import { isConnected } from "../../socket/socketio";
import { type BaseDocumentDto, DocType } from "../../types";
import { mangoToDexie } from "../MangoQuery/mangoToDexie";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { useDexieLiveQuery } from "../useDexieLiveQuery/useDexieLiveQuery";
import { applySortLimit, mergeById } from "./mergeDocs";
import { decideContentApiQuery, readType, typeIsInSyncList } from "./queryIntrospection";

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
     * The API supplement is **always one-shot** regardless of this flag (decided
     * once from the first local result). Live updates pushed from the API over the
     * socket are out of scope for now — see the module README.
     */
    live?: boolean;
};

/**
 * Local-first reactive query that merges Dexie (the local IndexedDB cache) with
 * an API supplement, given a configured content publishDate cutoff.
 *
 * Owns its data, its reconnect watcher (and future socket subscription), and its
 * teardown — one instance per query. Consumer pattern mirrors `ApiLiveQuery`:
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
 * // Pass { live: true } to keep the local Dexie source reactive (re-emits on
 * // every IndexedDB change). The default is one-shot.
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
 *
 * **Offline:** if `isConnected` is false when an API call is needed, the class
 * watches the connection and fires the POST once it becomes true (run-once). The
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
     * Stop the reconnect watcher (and any future internal subscriptions), mark
     * the instance dead so any in-flight POST that resolves later won't mutate
     * `output`, and release references. Idempotent. Called automatically when
     * the owning Vue scope disposes.
     */
    dispose(): void {
        this._disposed = true;
        this._disposers.forEach((fn) => fn());
        this._disposers.clear();
    }

    // ── internals ────────────────────────────────────────────────────────────

    private _run(): void {
        // Outer try/catch guarantees the synchronous routing (readType,
        // typeIsInSyncList, _startLocal / _runApiWhenOnline setup) cannot surface
        // an error to the constructor's `void this._run()`. The per-result work
        // (onLocal / _postAndMerge) carries its own handlers because it runs on a
        // later tick, outside this try.
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
                        if (api) void this._runApiWhenOnline(api);
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

    /** Replace the local contribution (the live emission may have dropped docs). */
    private _setLocal(local: T[]): void {
        this._local = local;
        this._recompute();
    }

    /** Set the one-shot remote supplement. */
    private _setRemote(remote: T[]): void {
        this._remote = remote;
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
        this.output.value = applySortLimit(
            mergeById(this._local, this._remote),
            this._sort,
            this._limit,
        );
    }
}
