import { watch } from "vue";
import {
    AckStatus,
    AclPermission,
    DocType,
    GLOBAL_AFFINITY_ID,
    getRest,
    getAccessibleGroups,
    isConnected,
    normalizeContribution,
    type AffinityMap,
    type ChangeReqAckDto,
    type GlobalAffinityDto,
    type Uuid,
} from "luminary-shared";
import { affinityConfig } from "@/recommendation/defaultAffinityStore";
import { globalAffinityMemberOf } from "@/recommendation/globalAffinityStore";
import { Sentry } from "@/util/initSentry";

/**
 * Client half of the audience-wide affinity profile: accumulate the same events that shape
 * the local profile, then hand the server one anonymous summary when the connection allows.
 *
 * Deliberately kept as cheap as the local profile it shadows — recording an event is object
 * arithmetic plus a localStorage write, with no network work on the hot path. Nothing is
 * ever sent mid-session; a contribution goes out only on a socket (re)connect, at most once
 * per `intervalHours`, and only from a client whose groups hold `Contribute`.
 */

const STORAGE_KEY = "globalAffinityContribution";

/** Delay after connect, so a contribution never competes with the sync burst. */
const FLUSH_DELAY_MS = 5_000;

type PendingContribution = {
    tags: AffinityMap;
    events: number;
    lastSentUtc: number;
};

const empty = (): PendingContribution => ({ tags: {}, events: 0, lastSentUtc: 0 });

function load(): PendingContribution {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (parsed && typeof parsed.tags === "object" && parsed.tags) {
            return {
                tags: parsed.tags as AffinityMap,
                events: typeof parsed.events === "number" ? parsed.events : 0,
                lastSentUtc: typeof parsed.lastSentUtc === "number" ? parsed.lastSentUtc : 0,
            };
        }
    } catch {
        // ignore corrupt storage
    }
    return empty();
}

function persist(pending: PendingContribution) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

/**
 * Fold an event's raw weight into the pending contribution. Raw, not decayed: the vector is
 * normalized to a single vote at send time, so only the relative weight of one tag against
 * another within this client's own activity matters.
 *
 * The tag cap drops the weakest rather than refusing new ones, so a long-running install
 * keeps tracking what the user actually engages with instead of freezing on whatever it
 * happened to see first.
 */
export function addContribution(tagIds: Uuid[] | undefined, weight: number) {
    if (!tagIds?.length || !Number.isFinite(weight) || weight === 0) return;

    const pending = load();
    for (const tag of tagIds) {
        if (!tag) continue;
        pending.tags[tag] = (pending.tags[tag] ?? 0) + weight;
    }
    pending.events++;

    const maxTags = affinityConfig.value.global.maxTags;
    const entries = Object.entries(pending.tags);
    if (entries.length > maxTags) {
        entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        pending.tags = Object.fromEntries(entries.slice(0, maxTags));
    }

    persist(pending);
}

/** Whether any of this client's groups may contribute to the aggregate. */
function canContribute(): boolean {
    return (getAccessibleGroups(AclPermission.Contribute)[DocType.GlobalAffinity] ?? []).length > 0;
}

let flushTimer: ReturnType<typeof setTimeout> | undefined;
let sending = false;

/**
 * Send the pending contribution if it is worth sending and this client is allowed to.
 * Exported for tests; production entry is the reconnect watcher below.
 */
export async function maybeFlush(): Promise<void> {
    if (sending) return;

    const { global } = affinityConfig.value;
    const pending = load();
    if (!pending.events) return;

    // Every gate below is a silent no-op by design — a skipped contribution costs the user
    // nothing. That makes a mis-set threshold or a missing permission indistinguishable from
    // "working normally", so say which gate stopped it rather than leaving it to be guessed.
    const skip = (reason: string) =>
        console.debug(`Global affinity contribution skipped: ${reason}`);

    if (pending.events < global.minEvents) {
        return skip(`${pending.events} of ${global.minEvents} actions needed`);
    }
    const waitMs = global.intervalHours * 60 * 60 * 1000 - (Date.now() - pending.lastSentUtc);
    if (waitMs > 0) {
        return skip(`${Math.ceil(waitMs / 60000)} min left of the per-client interval`);
    }
    // Checked here rather than at record time: the accessMap arrives with the connection, so
    // a client that is granted Contribute mid-life still sends what it has already gathered.
    if (!canContribute()) {
        return skip("no group of this user holds Contribute on globalAffinity");
    }

    const contribution = normalizeContribution(pending.tags);
    if (!Object.keys(contribution).length) return skip("nothing to contribute after normalizing");

    // The change request DTO requires a non-empty `memberOf`, so echo the synced singleton's.
    // No doc locally means the server has none either (or it hasn't reached us yet) — in both
    // cases a contribution would be rejected, so hold it for the next reconnect.
    const memberOf = globalAffinityMemberOf.value;
    if (!memberOf.length) return skip("the globalAffinity singleton has not synced yet");

    sending = true;
    try {
        const doc = {
            _id: GLOBAL_AFFINITY_ID,
            type: DocType.GlobalAffinity,
            // Shape, not authority: `validateChangeRequestAccess` replaces this with the stored
            // doc's groups, so a client can't move the singleton between groups.
            memberOf: [...memberOf],
            affinity: {},
            contribution,
        } as unknown as GlobalAffinityDto;

        const res = (await getRest().changeRequest({ id: 1, doc } as any)) as
            | ChangeReqAckDto
            | undefined;

        // Cleared only on a confirmed accept, so a dropped request keeps its evidence for the
        // next reconnect rather than silently losing a day of activity.
        if (res?.ack === AckStatus.Accepted) {
            persist({ tags: {}, events: 0, lastSentUtc: Date.now() });
            return;
        }

        // A rejection is retried on every reconnect, so without this the feature can sit dead
        // indefinitely (a missing singleton, or Contribute revoked between the accessMap and
        // the request) with nothing to show for it. Not a user-facing notification: a failed
        // contribution costs the user nothing.
        console.warn(`Global affinity contribution rejected: ${res?.message ?? "no response"}`);
    } catch (error) {
        Sentry?.captureException(error);
    } finally {
        sending = false;
    }
}

let started = false;

/**
 * Start contributing on socket (re)connect. Idempotent — call once after `init()` resolves.
 *
 * `isConnected` is the right edge to watch rather than socket.io's own `connect`: it flips
 * true only once the server's `clientConfig` has landed, so the accessMap the permission
 * check reads is the current one.
 */
export function initGlobalAffinityContribution() {
    if (started) return;
    started = true;

    watch(isConnected, (connected) => {
        if (!connected) {
            clearTimeout(flushTimer);
            return;
        }
        clearTimeout(flushTimer);
        flushTimer = setTimeout(() => void maybeFlush(), FLUSH_DELAY_MS);
    });
}
