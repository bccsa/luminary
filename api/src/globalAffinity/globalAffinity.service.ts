import { DbService } from "../db/db.service";
import { DocType, Uuid } from "../enums";
import { GlobalAffinityDto } from "../dto/GlobalAffinityDto";
import { DefaultAffinityDto, GlobalAffinityConfigDto } from "../dto/DefaultAffinityDto";
import { DEFAULT_AFFINITY_CONFIG, DEFAULT_AFFINITY_ID } from "../util/defaultAffinity";
import {
    GLOBAL_AFFINITY_ID,
    applyGlobalContribution,
    capGlobalAffinity,
    decayGlobalAffinity,
    normalizeContribution,
} from "../util/globalAffinity";

/**
 * How often buffered contributions are written to the singleton. An ops concern, not a CMS
 * knob: it trades write frequency against how stale the doc may be, and has no bearing on
 * how much any contribution counts.
 */
export const GLOBAL_AFFINITY_FLUSH_MS = 60_000;

/**
 * Ceiling on distinct tags held in the buffer between flushes, and on contributions folded
 * into one flush. Bounds memory if the database is unreachable for a long stretch — past
 * these, further contributions are dropped rather than queued. Statistical signal loses
 * nothing meaningful by shedding load; an unbounded buffer would lose the process.
 */
const MAX_BUFFERED_TAGS = 5_000;
const MAX_BUFFERED_CONTRIBUTIONS = 50_000;

/**
 * Accumulates per-client affinity contributions in memory and folds them into the
 * `GlobalAffinity` singleton on a timer.
 *
 * Why not write per request: `upsertDoc` is a whole-document replace whose conflict retry
 * reattaches the newest `_rev` to an unchanged body, so concurrent writers silently
 * overwrite each other. Many clients each writing one document would both lose
 * contributions and churn a single revision chain. Buffering makes the write rate
 * independent of the request rate and lets one serialized flush own the read-modify-write.
 */
export class GlobalAffinityService {
    private buffer: Record<Uuid, number> = {};
    private bufferedContributions = 0;
    private timer: NodeJS.Timeout | undefined;
    private flushing: Promise<void> | undefined;

    constructor(private db: DbService) {}

    /** Start the periodic flush. Idempotent. */
    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => void this.flush(), GLOBAL_AFFINITY_FLUSH_MS);
        // Never hold the process open for a statistics flush.
        this.timer.unref?.();
    }

    /** Stop the periodic flush and write anything still buffered. */
    async stop(): Promise<void> {
        this.dispose();
        await this.flush();
    }

    /** Stop the periodic flush, discarding whatever is buffered. */
    dispose(): void {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = undefined;
    }

    /**
     * Fold one client's contribution into the buffer. Re-normalizes to unit L1 — a client's
     * own normalization is not something to take on trust — so every caller contributes
     * exactly one vote regardless of what it sent.
     */
    contribute(contribution: Record<Uuid, number> | undefined): void {
        if (this.bufferedContributions >= MAX_BUFFERED_CONTRIBUTIONS) return;

        const normalized = normalizeContribution(contribution);
        const entries = Object.entries(normalized);
        if (!entries.length) return;

        for (const [tag, value] of entries) {
            if (!(tag in this.buffer) && Object.keys(this.buffer).length >= MAX_BUFFERED_TAGS) {
                continue;
            }
            this.buffer[tag] = (this.buffer[tag] ?? 0) + value;
        }
        this.bufferedContributions++;
    }

    /** Exposed for tests and for the flush timer. Serialized: concurrent calls share one run. */
    async flush(): Promise<void> {
        if (this.flushing) return this.flushing;
        this.flushing = this.runFlush().finally(() => {
            this.flushing = undefined;
        });
        return this.flushing;
    }

    private async runFlush(): Promise<void> {
        // Take the buffer before any await, so contributions arriving mid-flush accumulate
        // into the next batch instead of being dropped by the reset below.
        const pending = this.buffer;
        const pendingCount = this.bufferedContributions;
        if (!Object.keys(pending).length) return;
        this.buffer = {};
        this.bufferedContributions = 0;

        try {
            const config = await this.resolveConfig();
            const doc = await this.getSingleton();
            if (!doc) {
                // Not seeded yet. Contributions are dropped rather than creating the doc:
                // its `memberOf`/ACL is a deployment decision, not something to invent here.
                return;
            }

            const now = Date.now();
            const decayed = decayGlobalAffinity(doc.affinity ?? {}, doc.lastDecayUtc, now, config);
            const merged = applyGlobalContribution(decayed, pending, config);

            await this.db.upsertDoc({
                ...doc,
                affinity: capGlobalAffinity(merged, config),
                lastDecayUtc: now,
                contributionCount: (doc.contributionCount ?? 0) + pendingCount,
            });
        } catch (error) {
            // Put the batch back so a transient database failure costs a delay, not the data.
            // Bounded by the same caps as `contribute`.
            for (const [tag, value] of Object.entries(pending)) {
                this.buffer[tag] = (this.buffer[tag] ?? 0) + value;
            }
            this.bufferedContributions += pendingCount;
            console.error("Global affinity flush failed:", error);
        }
    }

    private async getSingleton(): Promise<GlobalAffinityDto | undefined> {
        const res = await this.db.getDoc(GLOBAL_AFFINITY_ID);
        const doc = res.docs?.[0] as GlobalAffinityDto | undefined;
        return doc?.type === DocType.GlobalAffinity ? doc : undefined;
    }

    /** The CMS-edited global knobs, read from the DefaultAffinity singleton. */
    private async resolveConfig(): Promise<GlobalAffinityConfigDto> {
        try {
            const res = await this.db.getDoc(DEFAULT_AFFINITY_ID);
            const doc = res.docs?.[0] as DefaultAffinityDto | undefined;
            return { ...DEFAULT_AFFINITY_CONFIG.global, ...doc?.config?.global };
        } catch {
            return DEFAULT_AFFINITY_CONFIG.global;
        }
    }
}

let instance: GlobalAffinityService | undefined;

/**
 * The process-wide accumulator, created (and its flush timer started) on the first
 * contribution. Lazy rather than wired into bootstrap so a deployment where nobody holds
 * `Contribute` never arms a timer it has no work for.
 */
export function getGlobalAffinityService(db: DbService): GlobalAffinityService {
    if (!instance) {
        instance = new GlobalAffinityService(db);
        instance.start();
    }
    return instance;
}

/** Drop the singleton so each test file starts from a clean accumulator. */
export function resetGlobalAffinityService(): void {
    instance?.dispose();
    instance = undefined;
}
