import { ref, watch } from "vue";
import {
    defaultAffinity,
    applyEvent,
    EventWeight,
    db,
    TagType,
    type AffinityProfile,
    type Uuid,
} from "luminary-shared";

/**
 * App-side persistence + tracking for the recommendation affinity profile.
 *
 * The working copy lives in localStorage (like `mediaProgress`) — deliberately NOT
 * in the Dexie `docs` table, so client retention (`deleteRevoked`) can never purge
 * it. It is deliberately client-local: no affinity document is queued or synced.
 * The CMS-managed default delivered in `clientConfig` only seeds a new local
 * profile, so administrators can tune recommendations for first-time clients.
 */

const STORAGE_KEY = "affinityProfile";
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

// Apply the CMS baseline once, only if this browser has never stored an affinity
// profile. An intentionally empty local profile remains the client's own choice.
watch(defaultAffinity, (serverDefault) => {
    if (serverDefault && !localStorage.getItem(STORAGE_KEY)) {
        affinityProfile.value = {
            affinity: { ...serverDefault },
            lastDecayUtc: undefined,
        };
        persist();
    }
});

/**
 * Record that the user engaged with a piece of content: fold its tag ids into the
 * affinity profile (with time decay) and persist it locally.
 *
 * `weight` defaults to {@link EventWeight.Open} (a plain view — the weakest, most
 * ambiguous signal). Pass a stronger weight for a more confident signal: an explicit
 * bookmark or a video/audio track finishing to completion are both real intent, not
 * just "the page was open," and should move the profile further per event.
 *
 * Deliberately called unconditionally from its (SingleContent/VideoPlayer/AudioPlayer/
 * LHighlightable) call sites, independent of `VITE_ENABLE_RECOMMENDATIONS` — only the
 * "Recommended for you" UI render is feature-flagged (`HomePage.vue`). Tracking keeps
 * running so the profile is already warm (not empty) the moment the flag is flipped on,
 * rather than showing a cold "no recommendations yet" feed on rollout day.
 */
export async function recordAffinity(tagIds: Uuid[] | undefined, weight: number = EventWeight.Open) {
    if (!tagIds || tagIds.length === 0) return;
    const topicTags = await filterToTopicTags(tagIds);
    if (!topicTags.length) return;
    affinityProfile.value = applyEvent(affinityProfile.value, topicTags, Date.now(), weight);
    persist();
}

/**
 * Restrict tag ids to `TagType.Topic`. `Category`/`AudioPlaylist` tags sit on most of
 * the corpus (e.g. a "Devotional" category), so feeding them into affinity would let
 * the site's most common tags — not the user's actual interests — dominate the profile.
 */
async function filterToTopicTags(tagIds: Uuid[]): Promise<Uuid[]> {
    try {
        const isTopic = await Promise.all(tagIds.map((id) => db.isTagType(id, TagType.Topic)));
        return tagIds.filter((_, i) => isTopic[i]);
    } catch {
        // db not initialized (e.g. unit tests) — don't block tracking on it.
        return tagIds;
    }
}
