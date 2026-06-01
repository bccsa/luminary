import {
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
    private _acc: T[] = [];
    private readonly _disposers = new Set<() => void>();
    private _disposed = false;

    constructor(query: MangoQuery) {
        this._query = query;
        this._limit = query.$limit;
        this._sort = query.$sort;
        this.output = shallowRef<T[]>([]);

        // Auto-teardown on unmount when constructed inside a Vue effect scope
        // (e.g. <script setup>). Vue's withAsyncContext keeps the scope valid
        // across top-level awaits, so this works even when `new HybridQuery(...)`
        // sits after an `await` in the script. A non-component caller will see no
        // active scope and must call `dispose()` manually.
        if (getCurrentScope()) onScopeDispose(() => this.dispose());

        // Fire-and-forget the background routing. `_run()` wraps the whole body
        // in try/catch, so a Dexie/postQuery failure cannot escape as an
        // unhandled rejection.
        void this._run();
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

    private async _run(): Promise<void> {
        // Outer try/catch guarantees `void this._run()` in the constructor cannot
        // surface as an unhandled rejection. The Dexie read can throw (corrupt
        // index, schema mismatch, table unavailable mid-teardown); on failure we
        // log and keep going so the API-supplement path still gets a chance.
        try {
            const type = readType(this._query);

            if (type === DocType.Content) {
                let local: T[] = [];
                try {
                    local = await mangoToDexie<T>(db.docs, this._query);
                    this._merge(local);
                } catch (err) {
                    console.error("[HybridQuery] local read failed:", err);
                }
                const api = decideContentApiQuery(this._query, local);
                if (api) await this._runApiWhenOnline(api);
                return;
            }

            if (typeIsInSyncList(type)) {
                try {
                    this._merge(await mangoToDexie<T>(db.docs, this._query));
                } catch (err) {
                    console.error("[HybridQuery] local read failed:", err);
                }
                return;
            }

            // Non-content type not in syncList → fetch from API only, no Dexie read.
            await this._runApiWhenOnline(this._query);
        } catch (err) {
            // Belt-and-braces: anything that escaped the inner handlers (the
            // reconnect-watcher setup, an unexpected throw in queryIntrospection
            // helpers, …) is logged here so the promise rejects cleanly.
            console.error("[HybridQuery] routing failed:", err);
        }
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
            const remote = await postQuery<T>(api);
            this._merge(remote);
        } catch (err) {
            console.error("[HybridQuery] remote query failed:", err);
        }
    }

    private _merge(incoming: readonly T[]): void {
        // After dispose(), any in-flight POST that resolves later must NOT
        // mutate output — the consumer has unmounted and treats the ref as dead.
        if (this._disposed) return;
        // UNION (not replace) — the remote query may fetch only the older tail
        // (publishDate <= cutoff), and fresh local docs above the cutoff must be
        // retained across the local-then-remote sequence. mergeById replaces
        // older versions of the same _id (latest updatedTimeUtc wins).
        this._acc = mergeById(this._acc, incoming as T[]);
        this.output.value = applySortLimit(this._acc, this._sort, this._limit);
    }
}
