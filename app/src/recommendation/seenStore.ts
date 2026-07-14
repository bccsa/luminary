import { ref } from "vue";
import type { Uuid } from "luminary-shared";

/**
 * Content ids the user has actually engaged with: articles via the dwell-gated call
 * in `SingleContent.vue`, audio/video via the `ended`/completion handlers in
 * `AudioPlayer.vue`/`VideoPlayer.vue`. `mediaProgress` (globalConfig.ts) is a
 * resume-playback ring buffer, not a history, so it is not a "seen" source.
 */
const STORAGE_KEY = "seenArticleIds";
/** Bound the stored list so it can't grow unboundedly over a long-lived install. */
const MAX_SEEN = 1000;

/** Bumped on every `markSeen` so reactive reads of `getSeenArticleIds()` invalidate —
 *  plain localStorage reads have no Vue dependency of their own. */
export const seenVersion = ref(0);

function load(): Uuid[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Invalidate reactive reads of the combined seen-id set (e.g. `mediaProgress` changed
 *  via `setMediaProgress`/`removeMediaProgress` in globalConfig.ts, which this store
 *  doesn't own but is derived from). */
export function bumpSeenVersion() {
    seenVersion.value++;
}

export function markSeen(id: Uuid) {
    const ids = load();
    if (ids.includes(id)) return;
    ids.push(id);
    if (ids.length > MAX_SEEN) ids.splice(0, ids.length - MAX_SEEN);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    seenVersion.value++;
}

export function getSeenArticleIds(): Uuid[] {
    return load();
}
