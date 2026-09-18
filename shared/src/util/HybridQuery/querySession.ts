import type { BaseDocumentDto, DocType as DocumentType } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { sanitizeArrayOperators } from "../MangoQuery/sanitizeArrayOperators";
import { isProvablyEmpty } from "../MangoQuery/isProvablyEmpty";
import { planRemoteContentQueries } from "./queryPlanner";
import { mergeById } from "./mergeDocs";
import { ResultWindow } from "./resultWindow";
import type {
    ActivityKind,
    QueryCapabilities,
    QueryPlan,
    SessionObserver,
    Dispose,
} from "./contracts";
import type { HybridQueryOptions } from "./options";

/**
 * Owns one query's execution lifetime. No Vue, storage or transport initialization.
 *
 * A generation is one query; a slice is one window size within it. `rebuild` starts
 * a generation from nothing, `extend` grows the current one — see {@link extend}.
 */
export class QuerySession<T extends BaseDocumentDto> {
    private generation = 0;
    private disposed = false;
    /** Torn down when the generation restarts: sockets, rooms, membership watches. */
    private readonly disposers = new Set<Dispose>();
    /** Torn down when a wider slice replaces the current one, and with the generation. */
    private readonly sliceDisposers = new Set<Dispose>();
    private query!: MangoQuery;
    private cacheKey = "";
    /** The generation's first `$limit`, so paging doesn't inflate the cached window. */
    private cacheLimit: number | undefined;
    private apiDecided = false;
    private firstSlice = true;
    /** Whether a live remote subscription has been started this generation — see `runSlice`. */
    private liveStarted = false;
    /** Whether the most recent page fetch failed outright, so `extend` should retry it. */
    private lastPageFailed = false;
    private activityKind: ActivityKind = "initial";
    private more = false;
    private published: T[] = [];
    private localIsPending = false;
    private remoteIsPending = false;
    private readonly window: ResultWindow<T>;
    private readonly options: HybridQueryOptions;

    constructor(
        private readonly queryFn: () => MangoQuery,
        options: HybridQueryOptions,
        private readonly capabilities: QueryCapabilities<T>,
        private readonly observer: SessionObserver<T>,
    ) {
        // Match the facade's historical construction-time option snapshot.
        this.options = { ...options };
        const { cache, persistence, sources } = capabilities;
        this.window = new ResultWindow<T>(
            {
                publish: (docs) => {
                    this.published = docs;
                    observer.publish(docs);
                },
                touchLocal: (docs) => persistence?.touchLocal?.(docs),
                // Without a validator no socket delete is accepted.
                validateDelete: (command) => sources.validateDelete?.(command) ?? false,
                cache: cache
                    ? (window, docs) => {
                          if ((!this.localPending && !this.remotePending) || docs.length > 0) {
                              cache.write(
                                  this.cacheKey,
                                  window,
                                  this.cacheLimit,
                                  this.options.cacheStripFields ?? [],
                              );
                          }
                      }
                    : undefined,
            },
            options.stripFields ?? [],
        );
    }

    private get localPending(): boolean {
        return this.localIsPending;
    }
    private set localPending(value: boolean) {
        this.localIsPending = value;
        this.emitActivity();
    }
    private get remotePending(): boolean {
        return this.remoteIsPending;
    }
    private set remotePending(value: boolean) {
        this.remoteIsPending = value;
        this.emitActivity();
    }
    private emitActivity(): void {
        // `more` is only meaningful over a settled window; a slice in flight keeps
        // the last answer so a consumer's control doesn't flicker while it loads.
        if (!this.localIsPending && !this.remoteIsPending) this.more = this.canExtend();
        this.observer.pending({
            local: this.localIsPending,
            remote: this.remoteIsPending,
            kind: this.activityKind,
            more: this.more,
        });
    }
    private canExtend(): boolean {
        // A failed fetch must stay retryable rather than reading as exhaustion: the
        // published window is under-filled precisely because the fetch never landed.
        if (this.lastPageFailed) return true;
        const pagination = this.capabilities.pagination;
        if (!pagination || this.disposed || !this.query) return false;
        try {
            return pagination.next(this.query, this.published) !== undefined;
        } catch (error) {
            console.error("[HybridQuery] pagination check failed:", error);
            return false;
        }
    }
    private active(gen: number): boolean {
        return !this.disposed && gen === this.generation;
    }
    private readonly own = (dispose: Dispose): void => {
        this.disposers.add(dispose);
    };
    private readonly ownSlice = (dispose: Dispose): void => {
        this.sliceDisposers.add(dispose);
    };
    private static drain(disposers: Set<Dispose>): void {
        const pending = Array.from(disposers);
        disposers.clear();
        pending.forEach((dispose) => dispose());
    }
    private cleanup(): void {
        QuerySession.drain(this.sliceDisposers);
        QuerySession.drain(this.disposers);
    }

    rebuild(query: MangoQuery): void {
        if (this.disposed) return;
        this.cleanup();
        this.generation++;
        this.window.reset(query, this.options.keepPreviousResult ?? false);
        this.apiDecided = false;
        this.firstSlice = true;
        this.liveStarted = false;
        this.lastPageFailed = false;
        this.activityKind = "initial";
        this.more = false;
        this.observer.error(undefined);
        this.query = { ...query, selector: sanitizeArrayOperators(query.selector) };
        this.cacheLimit = query.$limit;
        this.localPending = true;
        this.remotePending = false;
        if (this.capabilities.cache)
            this.cacheKey = this.capabilities.cache.key(query, this.options.cacheId);
        this.run();
    }

    /**
     * Grow the window by one slice without restarting the generation: both
     * contributions, the socket listener, the joined rooms and the membership watch
     * all survive, and only the query-bound local subscription is replaced.
     *
     * A no-op without a pagination capability, while a slice is still in flight, or
     * once that capability reports no further slice.
     */
    extend(): void {
        if (this.disposed || this.localPending || this.remotePending) return;
        const pagination = this.capabilities.pagination;
        if (!pagination) return;
        let next: MangoQuery | undefined;
        if (this.lastPageFailed) {
            // The published window under-filled because the fetch failed, not because
            // the source ran out — retry the same slice instead of advancing past it.
            next = this.query;
        } else {
            try {
                next = pagination.next(this.query, this.published);
            } catch (error) {
                console.error("[HybridQuery] pagination failed:", error);
            }
        }
        if (!next) {
            this.more = false;
            this.emitActivity();
            return;
        }
        QuerySession.drain(this.sliceDisposers);
        this.firstSlice = false;
        this.activityKind = "extend";
        this.apiDecided = false;
        this.query = { ...next, selector: sanitizeArrayOperators(next.selector) };
        this.window.widen(this.query);
        this.localPending = true;
        this.remotePending = false;
        try {
            this.runSlice(this.capabilities.plan(this.query), this.generation);
        } catch (error) {
            console.error("[HybridQuery] slice routing failed:", error);
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.window.dispose();
        this.cleanup();
    }

    private settleRemote(gen: number): void {
        if (!this.active(gen)) return;
        this.remotePending = false;
        this.window.settleRemote();
    }

    private watchMembership(type: DocumentType, gen: number): void {
        const coverage = this.capabilities.coverage;
        if (!coverage) return;
        this.own(
            coverage.watchMembership(type, () => {
                if (this.active(gen)) this.rebuild(this.queryFn());
            }),
        );
    }

    private run(): void {
        const gen = this.generation;
        try {
            if (isProvablyEmpty(this.query.selector)) {
                this.window.clearOutput();
                this.localPending = false;
                this.remotePending = false;
                return;
            }
            // Must finish synchronously before starting either source.
            const seed = this.capabilities.cache?.read<T>(this.cacheKey);
            if (seed) this.window.seed(seed);

            const plan = this.capabilities.plan(this.query);
            if (plan.watchMembership && plan.type) this.watchMembership(plan.type, gen);
            this.runSlice(plan, gen);
        } catch (error) {
            console.error("[HybridQuery] routing failed:", error);
        }
    }

    /**
     * Run one slice against a plan. Re-planned per slice because a plan closes over
     * the query it was built for, which a wider slice replaces.
     */
    /**
     * Rows earlier slices of this generation fetched. A response-cache seed also sits
     * in the remote contribution but is a stale first paint, not a fetch — counting it
     * would suppress the very supplement that supersedes it. A live socket upsert can
     * likewise add a doc to the remote contribution with no relation to any fetched
     * page, so `fetchedRemoteDocs` (not `remoteDocs`) is the boundary a plan narrows past.
     */
    private get held(): readonly T[] {
        return this.firstSlice ? [] : this.window.fetchedRemoteDocs;
    }

    private runSlice(plan: QueryPlan<T>, gen: number): void {
        if (!plan.useLocal) {
            const api = plan.remote?.([], false, this.held);
            // Order matters: raising the remote flag first means the observer never
            // sees a transient fully-settled state between the two writes.
            if (api) this.remotePending = true;
            this.localPending = false;
            if (!api) {
                this.remotePending = false;
                return;
            }
            void this.runApiWhenOnline([api], gen);
            if (this.options.live && !this.liveStarted) {
                this.liveStarted = true;
                const joinRooms = this.capabilities.sources.joinRooms;
                if (plan.joinRooms && plan.type && joinRooms) this.own(joinRooms(plan.type));
                this.startRemoteLive(api, plan.type, gen);
            }
            return;
        }

        this.startLocal(gen, (local, covered) => {
            if (!this.active(gen)) return;
            try {
                // Decide before accepting local data: hydration needs to know
                // whether an empty local read is still awaiting a supplement.
                if (!this.apiDecided) {
                    this.apiDecided = true;
                    const api = plan.remote?.(local, covered, this.held);
                    if (api) {
                        this.remotePending = true;
                        void this.runApiWhenOnline([api], gen);
                        if (this.options.live && !this.liveStarted) {
                            this.liveStarted = true;
                            this.startRemoteLive(api, plan.type, gen);
                        }
                    } else if (plan.remote) {
                        this.window.deferRemoteDrop();
                    }
                }
                this.window.setLocal(local, this.remotePending);
                this.localPending = false;
                if (plan.remote) this.window.flushRemoteDrop();
            } catch (error) {
                console.error("[HybridQuery] local update failed:", error);
            }
        });
    }

    private startLocal(gen: number, onLocal: (docs: T[], covered: boolean) => void): void {
        const observeLocal = this.capabilities.sources.observeLocal;
        if (!this.options.live || !observeLocal) {
            void this.capabilities.sources.readLocal(this.query).then(
                (read) => onLocal(read.docs, read.covered),
                (error) => {
                    if (this.active(gen)) this.observer.error(error);
                    console.error("[HybridQuery] local read failed:", error);
                    onLocal([], false);
                },
            );
            return;
        }
        observeLocal(
            this.query,
            // A live subscription only exists where the local source owns the query,
            // so every emission is covered.
            (docs) => onLocal(docs, true),
            (error) => {
                if (this.active(gen)) this.observer.error(error);
                // Preserve the existing live-read failure semantics, including pending state.
                console.error("[HybridQuery] live local read failed:", error);
            },
            // Slice-scoped: the subscription is bound to this slice's query, so a
            // wider one replaces it without disturbing the socket or room lifetime.
            this.ownSlice,
        );
    }

    private async runApiWhenOnline(apis: MangoQuery[], gen: number): Promise<void> {
        const watchConnection = this.capabilities.sources.watchConnection;
        if (this.capabilities.sources.connected?.() ?? true) {
            await this.postAndMerge(apis, gen);
            return;
        }
        if (!watchConnection) {
            this.settleRemote(gen);
            return;
        }
        let ran = false;
        const stop = watchConnection((connected) => {
            if (!connected || ran) return;
            ran = true;
            stop();
            this.disposers.delete(stop);
            void this.postAndMerge(apis, gen);
        });
        this.own(stop);
        // Deferred work is idle under the compatibility API, not a new loading cycle.
        this.settleRemote(gen);
    }

    private async postAndMerge(apis: MangoQuery[], gen: number): Promise<void> {
        try {
            const queries = apis.flatMap((api) => planRemoteContentQueries(api));
            const settled = await Promise.allSettled(
                queries.map((q) => this.capabilities.sources.readRemote(q)),
            );
            if (!this.active(gen)) return;
            const fulfilled = settled.filter(
                (s): s is PromiseFulfilledResult<T[]> => s.status === "fulfilled",
            );
            if (fulfilled.length < settled.length) {
                const firstError = settled.find((s) => s.status === "rejected") as
                    | PromiseRejectedResult
                    | undefined;
                console.error(
                    `[HybridQuery] ${settled.length - fulfilled.length}/${settled.length} remote query(ies) failed:`,
                    firstError?.reason,
                );
                // Any sub-query failing (not just all of them) is reported: a caller
                // that must not act on a partial fan-out result needs to know.
                this.observer.error(firstError?.reason);
            }
            if (fulfilled.length === 0) {
                this.lastPageFailed = true;
                return;
            }
            const remote = fulfilled.reduce<T[]>((acc, s) => mergeById(acc, s.value), []);
            this.window.setRemote(remote);
            this.capabilities.persistence?.persistRemote?.(remote);
            this.lastPageFailed = false;
        } catch (error) {
            if (this.active(gen)) {
                this.lastPageFailed = true;
                this.observer.error(error);
            }
            console.error("[HybridQuery] remote query failed:", error);
        } finally {
            this.settleRemote(gen);
        }
    }

    private startRemoteLive(api: MangoQuery, type: DocumentType | undefined, gen: number): void {
        const observeRemote = this.capabilities.sources.observeRemote;
        if (!observeRemote) return;
        observeRemote(
            api,
            type,
            (data, matches, matchesDelete) => {
                if (this.active(gen)) this.window.applySocketData(data, matches, matchesDelete);
            },
            this.own,
        );
    }
}
