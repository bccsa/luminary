/** Internal capability contracts. Nothing here initializes an environment. */
import type { ApiDataResponseDto, BaseDocumentDto, DeleteCmdDto, DocType } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import type { CachedWindow } from "./cacheCodec";

export type Dispose = () => void;
/** Register cleanup before starting a subscription that can fail during setup. */
export type OwnSubscription = (dispose: Dispose) => void;
export type RemoteChanges = (
    data: ApiDataResponseDto,
    matches: (doc: any) => boolean,
    matchesDelete: (doc: any) => boolean,
) => void;

/**
 * A local source's answer. `covered` is false when the source cannot answer the
 * query at all, which a plan must distinguish from an authoritative empty result:
 * an uncovered read may fall back to another source, a covered empty one may not.
 */
export interface LocalRead<T extends BaseDocumentDto> {
    docs: T[];
    covered: boolean;
}

/**
 * Only the two reads are required. The rest describe a live, connectivity-aware
 * environment; an environment without one (a build, an imperative lookup) omits
 * them rather than supplying stubs, and the session skips the work they drive.
 */
export interface QuerySources<T extends BaseDocumentDto> {
    readLocal(query: MangoQuery): Promise<LocalRead<T>>;
    readRemote(query: MangoQuery): Promise<T[]>;
    /** Omitted where remote reads can always be attempted. */
    connected?(): boolean;
    /** Required to defer a remote read taken while offline. */
    watchConnection?(onChange: (connected: boolean) => void): Dispose;
    /** Required in live mode; without it the local read stays one-shot. */
    observeLocal?(
        query: MangoQuery,
        onValue: (docs: T[]) => void,
        onError: (error: unknown) => void,
        own: OwnSubscription,
    ): void;
    /** Required in live mode to keep the remote contribution fresh. */
    observeRemote?(
        query: MangoQuery,
        type: DocType | undefined,
        onChanges: RemoteChanges,
        own: OwnSubscription,
    ): void;
    joinRooms?(type: DocType): Dispose;
    /** Gates socket deletes. Without it no delete command is accepted. */
    validateDelete?(command: DeleteCmdDto): boolean;
}

export interface QueryCoverage {
    cutoff(): number;
    isSynced(type: DocType | undefined): boolean;
    watchMembership(type: DocType, changed: () => void): Dispose;
}

export interface ResponseCache {
    key(query: MangoQuery, cacheId?: string): string;
    read<T extends BaseDocumentDto>(key: string): CachedWindow<T> | undefined;
    write<T extends BaseDocumentDto>(
        key: string,
        window: CachedWindow<T>,
        limit?: number,
        stripFields?: readonly string[],
    ): void;
}

/**
 * Which sources one generation runs and how its remote query is derived. Planning is
 * a capability so the browser's local-first rule and a build's corpus rule are two
 * implementations of one contract rather than branches inside the session.
 */
export interface QueryPlan<T extends BaseDocumentDto> {
    /** Read the local source. When false the generation is remote-only. */
    useLocal: boolean;
    /**
     * Derive the remote query, or `undefined` when no remote work is owed. Called
     * once per slice: with the first local result when `useLocal`, otherwise with an
     * empty, uncovered read. Absent entirely means the plan never goes remote.
     *
     * `held` is the remote contribution carried over from earlier slices — empty on
     * the first. The remote contribution accumulates, so a paging plan narrows past
     * `held` rather than re-requesting it.
     */
    remote?: (local: readonly T[], covered: boolean, held: readonly T[]) => MangoQuery | undefined;
    /** Resolved doc type, used for socket predicates and room subscriptions. */
    type?: DocType;
    /** Hold the type's socket rooms for this generation's lifetime. */
    joinRooms?: boolean;
    /** Re-route this generation when the type's sync membership flips. */
    watchMembership?: boolean;
}

/**
 * How a query's window grows past its first slice. Injected so limit-widening and
 * any other advance rule are implementations of one contract rather than branches
 * inside the session.
 *
 * `next` must be pure: the session also calls it to test whether a further slice
 * exists at all, and discards the result.
 */
export interface QueryPagination<T extends BaseDocumentDto> {
    /**
     * The query for the next slice, or `undefined` when the window cannot grow.
     *
     * It must select the window *cumulatively* — the whole of it, not the delta.
     * The local contribution is replaced by each read (so deletions propagate), so a
     * delta query would drop everything the earlier slices had. Narrowing past
     * already-fetched rows is the remote side's job, via {@link QueryPlan.remote}.
     *
     * @param loaded the currently published window.
     */
    next(query: MangoQuery, loaded: readonly T[]): MangoQuery | undefined;
}

export interface QueryCapabilities<T extends BaseDocumentDto> {
    plan(query: MangoQuery): QueryPlan<T>;
    sources: QuerySources<T>;
    /** Omitted where the window is fixed; without it the query cannot be extended. */
    pagination?: QueryPagination<T>;
    /** Required only by plans that watch sync membership. */
    coverage?: QueryCoverage;
    cache?: ResponseCache;
    /** Omitted where results are not retained locally, such as a build. */
    persistence?: {
        touchLocal?: (docs: readonly T[]) => void;
        /** Omitted when offline persistence is disabled. Receives unstripped documents. */
        persistRemote?: (docs: T[]) => void;
    };
}

/** What a stretch of activity serves, so a consumer can tell first paint from paging. */
export type ActivityKind = "initial" | "extend";

/** Which of a slice's sources are still working, and whether a further slice exists. */
export interface QueryActivity {
    local: boolean;
    remote: boolean;
    kind: ActivityKind;
    /**
     * Whether the pagination capability can produce a further slice. Recomputed
     * whenever a slice settles; holds its last value while one is in flight, and is
     * always false without a pagination capability.
     */
    more: boolean;
}

export interface SessionObserver<T> {
    publish(docs: T[]): void;
    pending(activity: QueryActivity): void;
    error(error: unknown | undefined): void;
}
