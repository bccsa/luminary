/**
 * State machine governing how long a response-cache-seeded first-paint window
 * survives before authoritative reads replace it. It tracks, per generation,
 * which contributions are still holding cache-seeded docs and which legs have
 * answered, so the merge layer can decide retention without scattering that
 * contract across its internals. Keeping it in one named unit makes the
 * seed-to-live transition table explicit and independently testable.
 */
export class SeedRetention {
    /** Ids of docs the cache seeded into the remote contribution. */
    private seededRemoteIds: Set<string> = new Set();
    /** True while the remote contribution still holds cache-seeded docs. */
    private remoteFromSeed = false;
    /** True while the local contribution is a cache seed rather than an authoritative read. */
    private seededLocal = false;
    /** True once the remote leg returned an authoritative answer. */
    private remoteAnswered = false;
    /** A one-shot flag meaning a seeded-remote drop is owed after the next local set. */
    private deferredRemoteDrop = false;

    /** Return all fields to their initial values. Called when a new generation starts. */
    reset(): void {
        this.seededRemoteIds = new Set();
        this.remoteFromSeed = false;
        this.seededLocal = false;
        this.remoteAnswered = false;
        this.deferredRemoteDrop = false;
    }

    /** Record the seed applied to both contributions at the start of a generation. */
    recordSeed(localCount: number, remoteIds: string[]): void {
        this.seededRemoteIds = new Set(remoteIds);
        this.remoteFromSeed = remoteIds.length > 0;
        this.seededLocal = localCount > 0;
    }

    /**
     * Whether an empty authoritative local read must be held back. An empty
     * authoritative local read must not collapse a seeded first paint while a
     * remote supplement is still in flight; a non-empty read replaces wholesale so
     * deletions still propagate.
     */
    shouldRetainLocal(localCount: number, remotePending: boolean): boolean {
        return localCount === 0 && this.seededLocal && remotePending;
    }

    /** Mark the local contribution as no longer a seed. */
    releaseLocal(): void {
        this.seededLocal = false;
    }

    /**
     * Whether either contribution still holds cache-seeded docs. A seeded doc is a
     * field-stripped projection carrying the real doc's `_id` and `updatedTimeUtc`,
     * so it is indistinguishable from the authoritative copy by those two keys —
     * the caller uses this to force a publish rather than trusting that comparison.
     */
    holdsSeed(): boolean {
        return this.seededLocal || this.remoteFromSeed;
    }

    /** Record that a seeded-remote drop is owed after the next local set. */
    deferRemoteDrop(): void {
        this.deferredRemoteDrop = true;
    }

    /** Return whether a deferred remote drop is owed, clearing the flag (take-once). */
    takeDeferredRemoteDrop(): boolean {
        const owed = this.deferredRemoteDrop;
        this.deferredRemoteDrop = false;
        return owed;
    }

    /**
     * Mark the remote leg answered and retire the seeded-remote ids. Only a real
     * answer retires seeded docs, so the caller can drop the seeded ids the answer
     * did not re-supply. Returns the seeded id set on the first answer, or
     * `undefined` when the remote was never seeded (or already retired).
     */
    recordRemoteAnswer(): Set<string> | undefined {
        this.remoteAnswered = true;
        if (!this.remoteFromSeed) return undefined;
        this.remoteFromSeed = false;
        const seeded = this.seededRemoteIds;
        this.seededRemoteIds = new Set();
        return seeded;
    }

    /**
     * Whether the seeded local window may be retired. A seeded window is retired
     * only by a genuine answer — a leg that settled because the caller is offline,
     * or because the request failed, keeps the seed so it heals on a later attempt.
     */
    shouldRetireLocal(): boolean {
        return this.seededLocal && this.remoteAnswered;
    }

    /**
     * Drop the seeded-remote contribution, returning its ids so the caller can
     * remove them. With no supplement owed, no answer will arrive, so the seed no
     * longer protects the local window — the local flag is cleared here too.
     * Returns `undefined` and changes nothing else when the remote was never seeded.
     */
    takeRemoteDrop(): Set<string> | undefined {
        if (!this.remoteFromSeed) return undefined;
        this.remoteFromSeed = false;
        const seeded = this.seededRemoteIds;
        this.seededRemoteIds = new Set();
        this.seededLocal = false;
        return seeded;
    }
}
