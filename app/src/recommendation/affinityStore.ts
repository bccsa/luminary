import { ref, watch } from "vue";
import {
    defaultAffinity,
    applyEvent,
    EventWeight,
    type AffinityProfile,
    type Uuid,
} from "luminary-shared";
import { filterTopicTagIds } from "@/recommendation/topicTags";

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
const empty = (): AffinityProfile => ({ affinity: {}, lastDecayUtc: undefined });

function load(): AffinityProfile {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : undefined;
        if (parsed && typeof parsed.affinity === "object") return parsed as AffinityProfile;
    } catch {
        // ignore corrupt storage
    }
    return empty();
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
 * LHighlightable) call sites to keep the affinity profile continuously updated.
 */
export async function recordAffinity(tagIds: Uuid[] | undefined, weight: number = EventWeight.Open) {
    if (!tagIds || tagIds.length === 0) return;
    const topicTags = await filterTopicTagIds(tagIds);
    if (!topicTags.length) return;
    affinityProfile.value = applyEvent(affinityProfile.value, topicTags, Date.now(), weight);
    persist();
}

/**
 * Record that recommended content was shown and scrolled past without being opened:
 * fold its topic tags into the affinity profile with the negative `EventWeight.Impression`
 * signal. This is the only negative signal in the profile — without it, a tag that
 * picked up one accidental positive interaction stays inflated for a full decay
 * half-life and keeps polluting retrieval.
 */
export async function recordImpressionMiss(tagIds: Uuid[] | undefined) {
    if (!tagIds || tagIds.length === 0) return;
    const topicTags = await filterTopicTagIds(tagIds);
    if (!topicTags.length) return;
    affinityProfile.value = applyEvent(
        affinityProfile.value,
        topicTags,
        Date.now(),
        EventWeight.Impression,
    );
    persist();
}
