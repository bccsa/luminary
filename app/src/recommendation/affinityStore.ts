import { ref, watch } from "vue";
import { applyEvent, type AffinityProfile, type Uuid } from "luminary-shared";
import { defaultAffinity, affinityConfig } from "@/recommendation/defaultAffinityStore";
import { filterTopicTagIds } from "@/recommendation/topicTags";

/**
 * App-side persistence + tracking for the recommendation affinity profile.
 *
 * The working copy lives in localStorage (like `mediaProgress`) — deliberately NOT
 * in the Dexie `docs` table, so client retention (`deleteRevoked`) can never purge
 * it. It is deliberately client-local: no affinity document is queued or synced.
 * The CMS-managed baseline (the synced `DefaultAffinity` singleton, see
 * `defaultAffinityStore.ts`) only seeds a new local profile, so administrators can
 * tune recommendations for first-time clients.
 */

const STORAGE_KEY = "affinityProfile";
/**
 * Schema/migration marker for the stored profile. Bumped when the score scale changes;
 * `loadAffinityProfile()` migrates a profile stored under an older scale to the current one.
 *   - v2: the default event weights were rescaled 100x finer (e.g. `completion` 0.35 →
 *     0.0035). Scores accumulated under the old weights are divided by 100 so they stay
 *     consistent with new events; without this, new tiny increments would be negligible
 *     noise on top of old 0–1 scores and the profile would be frozen.
 */
export const PROFILE_VERSION_KEY = "affinityProfile.v";
export const CURRENT_PROFILE_VERSION = "2";
/** Scores from pre-v2 profiles are multiplied by this to land on the v2 scale. */
export const V2_MIGRATION_FACTOR = 0.01;
const empty = (): AffinityProfile => ({ affinity: {}, lastDecayUtc: undefined });

/**
 * Migrate a stored profile to the v2 (100x finer) score scale. Pure so it can be tested
 * without re-importing the module: every score is multiplied by {@link V2_MIGRATION_FACTOR};
 * non-numeric entries are normalized to 0 and `lastDecayUtc` is preserved.
 */
export function migrateProfileToV2(profile: AffinityProfile): AffinityProfile {
    return {
        affinity: Object.fromEntries(
            Object.entries(profile.affinity).map(([tag, score]) => [
                tag,
                typeof score === "number" ? score * V2_MIGRATION_FACTOR : 0,
            ]),
        ),
        lastDecayUtc: profile.lastDecayUtc,
    };
}

/** Load + v2-migrate the stored affinity profile. Exported so debug tooling can re-read the
 *  same canonical (migration-aware) source `affinityProfile` was initialized from, rather
 *  than re-implementing the raw-parse/migrate logic. */
export function loadAffinityProfile(): AffinityProfile {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : undefined;
        if (parsed && typeof parsed.affinity === "object") {
            const profile = parsed as AffinityProfile;
            // Migrate a pre-v2 profile to the current (100x finer) score scale. Idempotent:
            // once the version marker is set this is a no-op, and an empty profile migrates
            // to itself. A corrupt/missing marker on a real profile is treated as v1.
            if (localStorage.getItem(PROFILE_VERSION_KEY) !== CURRENT_PROFILE_VERSION) {
                const migrated = migrateProfileToV2(profile);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                localStorage.setItem(PROFILE_VERSION_KEY, CURRENT_PROFILE_VERSION);
                return migrated;
            }
            return profile;
        }
    } catch {
        // ignore corrupt storage
    }
    return empty();
}

/** Reactive working copy of the local affinity profile (client-authoritative). */
export const affinityProfile = ref<AffinityProfile>(loadAffinityProfile());

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(affinityProfile.value));
    // Stamp the migration marker on every write so a profile created under the current
    // code (e.g. the CMS-baseline seed below) is never re-migrated on the next load.
    localStorage.setItem(PROFILE_VERSION_KEY, CURRENT_PROFILE_VERSION);
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
 * `weight` defaults to the CMS-configured `affinityConfig.value.hitWeight` (a plain
 * view — the weakest, most ambiguous signal). Pass a stronger weight for a more
 * confident signal: an explicit bookmark or a video/audio track finishing to
 * completion are both real intent, not just "the page was open," and should move
 * the profile further per event.
 *
 * Deliberately called unconditionally from its (SingleContent/VideoPlayer/AudioPlayer/
 * LHighlightable) call sites to keep the affinity profile continuously updated.
 */
export async function recordAffinity(
    tagIds: Uuid[] | undefined,
    weight: number = affinityConfig.value.hitWeight,
) {
    if (!tagIds || tagIds.length === 0) return;
    const topicTags = await filterTopicTagIds(tagIds);
    if (!topicTags.length) return;
    affinityProfile.value = applyEvent(
        affinityProfile.value,
        topicTags,
        Date.now(),
        weight,
        affinityConfig.value,
    );
    persist();
}

/**
 * Record that recommended content was shown and scrolled past without being opened:
 * fold its topic tags into the affinity profile with the negative
 * `affinityConfig.value.eventWeight.impression` signal. This is the only negative
 * signal in the profile — without it, a tag that
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
        affinityConfig.value.eventWeight.impression,
        affinityConfig.value,
    );
    persist();
}
