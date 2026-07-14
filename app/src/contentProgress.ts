import { ref } from "vue";
import type { Uuid } from "luminary-shared";

/**
 * Local content-progress store ("continue watching / reading"): one localStorage-backed,
 * recency-ordered list of per-content entries carrying media (watching) and/or reading
 * progress. Kept out of globalConfig on purpose — globalConfig only holds shared
 * variables; behaviour lives here.
 */

const CONTENT_PROGRESS_KEY = "contentProgress";
const MAX_CONTENT_PROGRESS_ENTRIES = 10;

export type ContentProgressWatching = {
    mediaId: string;
    progress: number;
    duration: number;
};

export type ContentProgressReading = {
    progress: number;
};

export type ContentProgressEntry = {
    contentId: Uuid;
    updatedAt: number;
    watching?: ContentProgressWatching;
    reading?: ContentProgressReading;
};

// Legacy localStorage shapes (the old flat `mediaProgress` / `readingProgress` keys).
// Only the one-time migration below reads them — not part of the module's public API.
type LegacyMediaProgressEntry = ContentProgressWatching & {
    contentId: Uuid;
};

type LegacyReadingProgressEntry = {
    contentId: Uuid;
    progress: number;
};

function isContentProgressEntry(item: unknown): item is ContentProgressEntry {
    return (
        typeof item === "object" &&
        item !== null &&
        "contentId" in item &&
        typeof (item as ContentProgressEntry).contentId === "string"
    );
}

function migrateLegacyProgressStorage(): ContentProgressEntry[] {
    const byContentId = new Map<string, ContentProgressEntry>();
    const now = Date.now();

    try {
        const mediaList = JSON.parse(localStorage.getItem("mediaProgress") || "[]");
        if (Array.isArray(mediaList)) {
            mediaList.forEach((item: LegacyMediaProgressEntry, index: number) => {
                if (!item?.contentId || item.duration === Infinity) return;
                const existing = byContentId.get(item.contentId);
                const entry: ContentProgressEntry = existing ?? {
                    contentId: item.contentId,
                    updatedAt: now - index,
                };
                entry.watching = {
                    mediaId: item.mediaId,
                    progress: item.progress,
                    duration: item.duration,
                };
                entry.updatedAt = Math.max(entry.updatedAt, now - index);
                byContentId.set(item.contentId, entry);
            });
        }
    } catch {
        // ignore invalid legacy data
    }

    try {
        const readingList = JSON.parse(localStorage.getItem("readingProgress") || "[]");
        if (Array.isArray(readingList)) {
            readingList.forEach((item: LegacyReadingProgressEntry, index: number) => {
                if (!item?.contentId) return;
                const existing = byContentId.get(item.contentId);
                const entry: ContentProgressEntry = existing ?? {
                    contentId: item.contentId,
                    updatedAt: now - 10_000 - index,
                };
                entry.reading = { progress: item.progress };
                if (!existing) {
                    entry.updatedAt = now - 10_000 - index;
                }
                byContentId.set(item.contentId, entry);
            });
        }
    } catch {
        // ignore invalid legacy data
    }

    const migrated = Array.from(byContentId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    if (migrated.length > 0) {
        localStorage.setItem(CONTENT_PROGRESS_KEY, JSON.stringify(migrated));
        localStorage.removeItem("mediaProgress");
        localStorage.removeItem("readingProgress");
    }
    return migrated;
}

function readContentProgressFromStorage(): ContentProgressEntry[] {
    try {
        const list = JSON.parse(localStorage.getItem(CONTENT_PROGRESS_KEY) || "[]");
        if (Array.isArray(list) && list.length > 0) {
            return list.filter(isContentProgressEntry);
        }
    } catch {
        // fall through to migration
    }
    return migrateLegacyProgressStorage();
}

const _contentProgress: ContentProgressEntry[] = readContentProgressFromStorage();

export const contentProgressAsRef = ref<ContentProgressEntry[]>([..._contentProgress]);

function applyContentProgressList(list: ContentProgressEntry[]) {
    _contentProgress.length = 0;
    _contentProgress.push(...list);
    contentProgressAsRef.value = [..._contentProgress];
}

function persistContentProgress() {
    localStorage.setItem(CONTENT_PROGRESS_KEY, JSON.stringify(_contentProgress));
}

function findContentProgressEntry(contentId: Uuid): ContentProgressEntry | undefined {
    return _contentProgress.find((entry) => entry.contentId === contentId);
}

function touchContentProgressEntry(contentId: Uuid): ContentProgressEntry {
    const index = _contentProgress.findIndex((entry) => entry.contentId === contentId);
    const entry: ContentProgressEntry =
        index >= 0 ? _contentProgress[index] : { contentId, updatedAt: Date.now() };
    entry.updatedAt = Date.now();
    if (index >= 0) {
        _contentProgress.splice(index, 1);
    }
    _contentProgress.unshift(entry);
    if (_contentProgress.length > MAX_CONTENT_PROGRESS_ENTRIES) {
        _contentProgress.splice(MAX_CONTENT_PROGRESS_ENTRIES);
    }
    return entry;
}

function pruneEmptyContentProgressEntry(contentId: Uuid) {
    const index = _contentProgress.findIndex((entry) => entry.contentId === contentId);
    if (index < 0) return;
    const entry = _contentProgress[index];
    if (!entry.watching && !entry.reading) {
        _contentProgress.splice(index, 1);
    }
}

/** Reload content progress from localStorage into the reactive ref (e.g. after cross-tab updates). */
export function syncContentProgressFromStorage(): void {
    applyContentProgressList(readContentProgressFromStorage());
}

/** Listen for `storage` events on the contentProgress key. Returns a cleanup function. */
export function watchContentProgressStorage(): () => void {
    const onStorage = (e: StorageEvent) => {
        if (e.key === CONTENT_PROGRESS_KEY || e.key === null) {
            syncContentProgressFromStorage();
        }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
/**
 * Get the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @returns - Playback progress in seconds
 */
export const getMediaProgress = (mediaId: string, contentId: Uuid) => {
    const watching = findContentProgressEntry(contentId)?.watching;
    if (!watching || watching.mediaId !== mediaId) return 0;
    return watching.progress;
};

/**
 * Get the duration of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @returns - Duration time in seconds
 */
export const getMediaDuration = (mediaId: string, contentId: Uuid): number => {
    const watching = findContentProgressEntry(contentId)?.watching;
    if (!watching || watching.mediaId !== mediaId) return 0;
    return watching.duration;
};

/**
 * Set the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @param progress - Playback progress in seconds
 * @param duration - Optional duration in seconds, if available
 */
export const setMediaProgress = (
    mediaId: string,
    contentId: Uuid,
    progress: number,
    duration: number,
) => {
    if (duration === Infinity) return;

    const entry = touchContentProgressEntry(contentId);
    entry.watching = { mediaId, progress, duration };
    applyContentProgressList([..._contentProgress]);
    persistContentProgress();
};

/**
 * Remove the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 */
export const removeMediaProgress = (mediaId: string, contentId: Uuid) => {
    const entry = findContentProgressEntry(contentId);
    if (!entry?.watching || entry.watching.mediaId !== mediaId) return;

    delete entry.watching;
    pruneEmptyContentProgressEntry(contentId);
    applyContentProgressList([..._contentProgress]);
    persistContentProgress();
};

/**
 * Get the reading progress of a content item.
 * @param contentId - The content document ID.
 * @returns - Reading progress in percentage (0–100)
 */
export const getReadingProgress = (contentId: Uuid): number => {
    return findContentProgressEntry(contentId)?.reading?.progress ?? 0;
};

/**
 * Set the reading progress of a content item.
 * If it already exists, update it; otherwise, insert it.
 * @param contentId - The content document ID.
 * @param progress - Progress percentage (0–100)
 */
export const setReadingProgress = (contentId: Uuid, progress: number) => {
    const clampedProgress = Math.min(Math.max(progress, 0), 100);
    const existing = findContentProgressEntry(contentId);
    // Unchanged progress on an entry that's already most-recent is a true no-op (the common
    // hot-path case while scrolling within one segment) — skip the write. An unchanged-progress
    // revisit of content that's no longer at the front still needs to bump recency so it
    // re-surfaces in the continue-reading row, so only short-circuit when both hold.
    const alreadyMostRecent = _contentProgress[0]?.contentId === contentId;
    if (existing?.reading?.progress === clampedProgress && alreadyMostRecent) return;

    const entry = touchContentProgressEntry(contentId);
    entry.reading = { progress: clampedProgress };
    applyContentProgressList([..._contentProgress]);
    persistContentProgress();
};

/**
 * Remove reading progress for a given content.
 */
export const removeReadingProgress = (contentId: Uuid) => {
    const entry = findContentProgressEntry(contentId);
    if (!entry?.reading) return;

    delete entry.reading;
    pruneEmptyContentProgressEntry(contentId);
    applyContentProgressList([..._contentProgress]);
    persistContentProgress();
};
