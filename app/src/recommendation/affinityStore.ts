import { ref, watch } from "vue";
import {
    db,
    serverAffinity,
    applyEvent,
    EventWeight,
    DocType,
    type AffinityProfile,
    type UserAffinityDto,
    type Uuid,
} from "luminary-shared";

/**
 * App-side persistence + tracking for the recommendation affinity profile.
 *
 * The working copy lives in localStorage (like `mediaProgress`) — deliberately NOT
 * in the Dexie `docs` table, so client retention (`deleteRevoked`) can never purge
 * it. The server copy (for cross-device sync) is seeded from the socket
 * `clientConfig` via `serverAffinity`, and pushed back through the normal
 * change-request queue with `localChangesOnly: true` (no docs-table write).
 */

const STORAGE_KEY = "affinityProfile";
const OWNER_KEY = "affinityOwner";
const EMPTY: AffinityProfile = { affinity: {}, lastDecayUtc: undefined };

function load(): AffinityProfile {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : undefined;
        if (parsed && typeof parsed.affinity === "object") return parsed as AffinityProfile;
    } catch {
        // ignore corrupt storage
    }
    return { ...EMPTY };
}

/** Reactive working copy of the local affinity profile (client-authoritative). */
export const affinityProfile = ref<AffinityProfile>(load());

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(affinityProfile.value));
}

// Seed from the server-delivered profile when this device has nothing for the current
// user — a fresh device after login (local empty), or a different user signing in on a
// shared device (owner changed). On a device already tracking the same user, the local
// copy is newer (client-authoritative), so it is kept and our own pushes win.
watch(serverAffinity, (server) => {
    if (!server) return;
    const storedOwner = localStorage.getItem(OWNER_KEY);
    const isEmpty = Object.keys(affinityProfile.value.affinity).length === 0;
    if (server.ownerId !== storedOwner || isEmpty) {
        affinityProfile.value = {
            affinity: { ...server.affinity },
            lastDecayUtc: server.lastDecayUtc,
        };
        persist();
        if (server.ownerId) localStorage.setItem(OWNER_KEY, server.ownerId);
    }
});

// --- throttled server push (at most once per PUSH_INTERVAL_MS) ---
const PUSH_INTERVAL_MS = 30_000;
let lastPush = 0;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePush() {
    const owner = serverAffinity.value; // carries _id + ownerId once logged in
    if (!owner?._id) return; // guest → local-only, no server copy to sync
    if (pushTimer) return; // a push is already queued; it will read the latest profile
    const due = Math.max(0, PUSH_INTERVAL_MS - (Date.now() - lastPush));
    pushTimer = setTimeout(() => {
        pushTimer = undefined;
        lastPush = Date.now();
        const cur = serverAffinity.value;
        if (!cur?._id) return;
        const doc: UserAffinityDto = {
            _id: cur._id,
            type: DocType.UserAffinity,
            ownerId: cur.ownerId,
            affinity: affinityProfile.value.affinity,
            lastDecayUtc: affinityProfile.value.lastDecayUtc,
            updatedTimeUtc: Date.now(),
        };
        // Queue to /changerequest WITHOUT writing the docs table; overwrite any
        // previously-queued affinity change so they don't pile up.
        void db.upsert({ doc, localChangesOnly: true, overwriteLocalChanges: true });
    }, due);
}

/**
 * Record that the user engaged with a piece of content: fold its tag ids into the
 * affinity profile (with time decay), persist locally, and schedule a throttled push
 * to the server copy. Safe to call on every content open — cheap and debounced.
 *
 * `weight` defaults to {@link EventWeight.Open} (a plain view — the weakest, most
 * ambiguous signal). Pass a stronger weight for a more confident signal: an explicit
 * bookmark or a video/audio track finishing to completion are both real intent, not
 * just "the page was open," and should move the profile further per event.
 */
export function recordAffinity(tagIds: Uuid[] | undefined, weight: number = EventWeight.Open) {
    if (!tagIds || tagIds.length === 0) return;
    affinityProfile.value = applyEvent(affinityProfile.value, tagIds, Date.now(), weight);
    persist();
    schedulePush();
}
