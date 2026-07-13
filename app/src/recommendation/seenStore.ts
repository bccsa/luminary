import { ref } from "vue";
import type { Uuid } from "luminary-shared";

/**
 * Article content ids the user has actually dwelt on (see the dwell-gated call in
 * `SingleContent.vue`). Audio/video already has its own "seen" signal via
 * `mediaProgress`; articles have none without this, so they could be recommended
 * indefinitely.
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
