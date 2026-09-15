/** Owns documents and display transitions; all environmental effects are injected. */
import type { BaseDocumentDto, ApiDataResponseDto, DeleteCmdDto } from "../../types";
import { DocType } from "../../types";
import type { MangoQuery } from "../MangoQuery/MangoTypes";
import { mergeById, applySortLimit, sameWindow } from "./mergeDocs";
import { SeedRetention } from "./seedRetention";
import { omitFields, type CachedWindow } from "./cacheCodec";

/**
 * Observable side effects a `ResultWindow` drives. Injected so the merge
 * logic can run without Vue, Dexie or sockets — the window decides *when*,
 * the host decides what reaching the outside world means.
 */
export interface WindowEffects<T extends BaseDocumentDto> {
    /** Push the visible window to the consumer-facing output. */
    publish(docs: T[]): void;
    /** Persist a `{ local, remote }` snapshot for a later cache-seeded first paint. */
    cache?(window: CachedWindow<T>, docs: T[]): void;
    /**
     * Mark below-cutoff content docs as recently-used so eviction doesn't purge
     * older docs that only the API supplement supplied.
     */
    touchLocal(docs: readonly T[]): void;
    /** Reject a DeleteCmd before it is honoured (reason / permission gating). */
    validateDelete(command: DeleteCmdDto): boolean;
}

/**
 * Owns one query generation's document contributions — local Dexie reads,
 * API supplements, socket upserts and deletes — and derives the visible
 * sorted/limited window from their union. Tombstones suppress socket-deleted
 * docs that linger in a source until it catches up. All observable side
 * effects are injected via `effects`, so the class has no environment imports.
 */
export class ResultWindow<T extends BaseDocumentDto> {
    private _local: T[] = [];
    private _remote: T[] = [];
    private _output: T[] = [];
    private _sort?: MangoQuery["$sort"];
    private _limit?: number;
    private _disposed = false;
    private readonly _seed = new SeedRetention();
    /** Delete time by doc id — set when a socket delete hits a local copy, released in `setLocal`. */
    private readonly _tombstones = new Map<string, number>();

    /**
     * @param effects Injected side effects — see `WindowEffects`.
     * @param _stripFields Heavy fields removed from every incoming doc at
     *   ingest so they never reach the output or the response cache.
     */
    constructor(
        private readonly effects: WindowEffects<T>,
        private readonly _stripFields: string[] = [],
    ) {}

    /**
     * Start a new query generation: drop both contributions and all seed state,
     * and adopt the query's sort/limit. `keepPrevious` leaves the last published
     * window standing until new data lands, so a re-run doesn't blank the display.
     */
    reset(query: MangoQuery, keepPrevious: boolean): void {
        this._local = [];
        this._remote = [];
        if (!keepPrevious) this.clearOutput();
        this._seed.reset();
        this._tombstones.clear();
        this._sort = query.$sort;
        this._limit = query.$limit;
    }

    /**
     * Adopt a later slice of the generation already running: take the query's
     * sort/limit while keeping both contributions, the seed state and the
     * tombstones. The counterpart to `reset`, which starts a generation over.
     */
    widen(query: MangoQuery): void {
        this._sort = query.$sort;
        this._limit = query.$limit;
        this._recompute();
    }

    /**
     * The accumulated remote contribution, for a plan deriving the next slice's
     * remote query — it narrows past these rather than re-requesting them.
     */
    get remoteDocs(): readonly T[] {
        return this._remote;
    }

    /** Publish an empty window, only when something is currently visible. */
    clearOutput(): void {
        if (this._output.length) {
            this._output = [];
            this.effects.publish(this._output);
        }
    }

    /**
     * Install a response-cache snapshot as the first paint of both contributions.
     * `_seed` tracks the provenance so the authoritative reads replace the seed
     * without collapsing or duplicating it as they land.
     */
    seed(window: CachedWindow<T>): void {
        this._local = this._strip(window.local);
        this._remote = this._strip(window.remote);
        this._seed.recordSeed(
            this._local.length,
            this._remote.map((d) => d._id),
        );
        this._recompute();
    }

    /**
     * When the local read decided no API supplement is owed, schedule the
     * seeded-remote drop to run only after the next `setLocal` — the seed must
     * still be holding when the authoritative local read settles.
     */
    deferRemoteDrop(): void {
        this._seed.deferRemoteDrop();
    }
    /** Run the drop scheduled by `deferRemoteDrop`, if one is owed. */
    flushRemoteDrop(): void {
        if (this._seed.takeDeferredRemoteDrop()) this.dropSeededRemote();
    }
    /**
     * Retire a seeded local contribution once the remote leg has genuinely
     * answered, so a later empty local read publishes as empty instead of
     * being held back by `shouldRetainLocal`.
     */
    settleRemote(): void {
        if (this._seed.shouldRetireLocal()) {
            this._seed.releaseLocal();
            this._local = [];
            this._recompute(true);
        }
    }
    /** Ignore further socket batches; the session owns the lifecycle. */
    dispose(): void {
        this._disposed = true;
    }

    /** Split the visible window back into its contributions for cache persistence. */
    private snapshot(): CachedWindow<T> {
        const localIds = new Set(this._local.map((d) => d._id));
        return {
            local: this._output.filter((d) => localIds.has(d._id)),
            remote: this._output.filter((d) => !localIds.has(d._id)),
        };
    }

    /**
     * Fold a live-update batch into the window: upserts that match the query
     * merge into the remote contribution, and honoured DeleteCmds remove docs —
     * tombstoning local copies that Dexie will re-emit until it catches up.
     *
     * @param matchP Selector predicate — docs failing it are ignored.
     * @param deleteP Cheap docType / id-list pre-filter for DeleteCmds; the
     *   authoritative gates are `validateDelete` and window membership.
     */
    applySocketData(
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
                if (!this.effects.validateDelete(cmd)) continue; // reason / permission / CMS gate
                if (!deleteP(cmd)) continue; // docType / id-list pre-filter
                const cur = this._findById(cmd.docId); // membership = the real gate
                if (!cur || cur.updatedTimeUtc >= cmd.updatedTimeUtc) continue; // stale guard
                deleteIds.add(cmd.docId);
                // A LOCAL copy will be re-emitted by Dexie until it catches up, so a
                // tombstone suppresses the stale copy meanwhile (pruned in
                // `setLocal`). `_remote` has no external catch-up, so it's filtered
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

        if (upserts.length) this._remote = mergeById(this._remote, this._strip(upserts));
        // Durable removal from the remote contribution. Local copies are handled by
        // the tombstone (don't filter `_local` here — a filter would let the next
        // Dexie re-emit resurrect the doc with no tombstone left to suppress it).
        if (deleteIds.size) this._remote = this._remote.filter((d) => !deleteIds.has(d._id));
        this._recompute();
    }

    /** First copy of `id` across the remote then local contributions, if any. */
    private _findById(id: string): T | undefined {
        return this._remote.find((d) => d._id === id) ?? this._local.find((d) => d._id === id);
    }

    /**
     * Drop `_stripFields` from each doc so they never reach `_local`/`_remote`/
     * `output` (the heap). Returns the array unchanged when nothing is configured,
     * and `omitFields` returns each doc unchanged when it has none of the fields —
     * so a no-op strip allocates nothing.
     */
    private _strip(docs: T[]): T[] {
        return this._stripFields.length ? docs.map((d) => omitFields(d, this._stripFields)) : docs;
    }

    /** Replace the local contribution with a fresh Dexie read (which may have dropped docs). */
    setLocal(local: T[], remotePending: boolean): void {
        local = this._strip(local);
        // Prune tombstones the fresh Dexie read has caught up on: the id is gone,
        // or present with a copy NEWER than the delete (republished). A still-
        // present at-or-older copy keeps its tombstone so `_recompute` suppresses
        // it. This is where socket-delete tombstones are reliably released.
        if (this._tombstones.size) {
            const release: string[] = [];
            this._tombstones.forEach((ts, id) => {
                const staleStillPresent = local.some((d) => d._id === id && d.updatedTimeUtc <= ts);
                if (!staleStillPresent) release.push(id);
            });
            release.forEach((id) => this._tombstones.delete(id));
        }
        // Retain a cache-seeded window while the remote leg is still in flight: a cold-start
        // empty local read must not collapse the seeded first paint before the supplement
        // lands. A non-empty read still replaces wholesale (deletions propagate); once the
        // remote settles the flag is cleared and a genuine empty publishes as usual.
        if (this._seed.shouldRetainLocal(local.length, remotePending)) {
            this._recompute();
            return;
        }
        // This read replaces a seeded local contribution, so force the publish.
        const retiringSeed = this._seed.holdsSeed();
        this._seed.releaseLocal();
        this._local = local;
        this._recompute(retiringSeed);
    }

    /**
     * Merge the remote supplement into `_remote` (union by `_id`, newer wins).
     * Merge — not replace — so a socket upsert that lands BEFORE the one-shot POST
     * resolves is not wiped. One-shot behaviour is unchanged: `_remote` starts
     * `[]`, so the first merge equals the POST result.
     *
     * Response-cache seed: when `_remote` was seeded from the cache, this first
     * authoritative POST drops the seeded older-tail docs it did NOT re-supply (e.g.
     * since-deleted), while keeping anything a socket upsert added after the seed —
     * then unions in its own result.
     */
    setRemote(remote: T[]): void {
        // Strip here (not at the call site) so the caller's pre-strip array can
        // still be written to IndexedDB by `persistOffline` with all fields intact.
        remote = this._strip(remote);
        const seeded = this._seed.recordRemoteAnswer();
        if (seeded) {
            const keep = this._remote.filter((d) => !seeded.has(d._id));
            this._remote = mergeById(keep, remote);
        } else {
            this._remote = mergeById(this._remote, remote);
        }
        // A seeded remote contribution has been superseded, so force the publish.
        this._recompute(seeded !== undefined);
    }

    /**
     * Drop response-cache-seeded remote docs once the local read has decided no API
     * supplement is needed (so no POST will arrive to supersede them), keeping any
     * socket upserts added since the seed. No-op when nothing was seeded.
     */
    dropSeededRemote(): void {
        const seeded = this._seed.takeRemoteDrop();
        if (seeded === undefined) return;
        this._remote = this._remote.filter((d) => !seeded.has(d._id));
        this._recompute(true);
    }

    /**
     * @param force Publish even when the window looks unchanged — see the `sameWindow`
     *   call below. Set by the paths that retire a cache seed.
     */
    private _recompute(force = false): void {
        if (this._disposed) return;
        this.effects.touchLocal(this._local);
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
            // tombstones are released in `setLocal`, not here, so a delete survives
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
        //
        // `sameWindow` compares `_id` + `updatedTimeUtc`, which a cache seed shares with
        // the doc it stands in for: a seed written with `cacheStripFields` is a
        // field-stripped projection, so the authoritative copy carrying those fields back
        // compares equal and would never publish. `force` covers the recompute that
        // retires a seed, so the restored fields reach consumers.
        if (force || !sameWindow(windowed, this._output)) {
            this._output = windowed;
            this.effects.publish(windowed);
            this.effects.cache?.(this.snapshot(), windowed);
        }
    }
}
