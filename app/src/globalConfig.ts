import {
    DocType,
    HybridQuery,
    type LanguageDto,
    type Uuid,
    type ContentDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { loadFallbackImageUrls } from "./util/loadFallbackImages";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;
export const isTestEnviroment = import.meta.env.MODE === "test";
export const cmsUrl = ref(import.meta.env.VITE_CLIENT_CMS_URL);

const isTestEnv = import.meta.env.MODE === "test";

const windowWidth = ref(window.innerWidth);
window.addEventListener("resize", () => {
    windowWidth.value = window.innerWidth;
});
// Tailwind breakpoints: md = 768px, lg = 1024px
export const isMdScreen = computed(() => windowWidth.value < 768);
export const isMobileScreen = computed(() => windowWidth.value < 1024);
export const isSmallScreen = computed(() => windowWidth.value < 1500);

/**
 * We want to only show one privacy policy modal per session.
 * This is used to track one singular instance of the modal being shown.
 */
export const showPrivacyPolicyModal = ref(false);

/**
 * Whether the user has opted into reduced data usage (OS/browser "Data Saver"). Read from the
 * Network Information API's `saveData` flag, which Chromium-based browsers expose even when they
 * don't yet support the `prefers-reduced-data` media query. Returns false when unknown (Safari/iOS).
 */
export const isDataSaverEnabled = (): boolean => {
    if (isTestEnv) return false;

    return !!(
        (navigator as any).connection ||
        (navigator as any).mozConnection ||
        (navigator as any).webkitConnection
    )?.saveData;
};

/**
 * User-controlled "Data Saver" preference, persisted to localStorage and toggled from the Settings
 * page. Independent of the OS/browser `saveData` flag (`isDataSaverEnabled`) and the measured
 * connection speed (`useNetworkSpeedEstimator`) — any of the three being on reduces image quality. A
 * module-level singleton ref so every consumer (Settings toggle, image provider) shares one value.
 */
export const userDataSaverEnabled = ref(localStorage.getItem("dataSaver") === "true");
watch(userDataSaverEnabled, (enabled) => {
    localStorage.setItem("dataSaver", String(enabled));
});

/**
 * Get device information.
 * @returns
 */
export const getDeviceInfo = () => {
    return {
        platform: (navigator as any).userAgentData?.platform || navigator.platform,
        userAgent: navigator.userAgent,
    };
};

/**
 * True when the user is on a macOS / iOS device.
 * Used to show platform-appropriate keyboard shortcut labels (e.g. Cmd+K vs Ctrl+K).
 */
export const isMac = computed(() => {
    if (typeof navigator === "undefined") return false;
    const uaDataPlatform = (navigator as any).userAgentData?.platform?.toLowerCase?.() ?? "";
    if (uaDataPlatform) return uaDataPlatform.includes("mac");

    const ua = (navigator.userAgent || "").toLowerCase();
    return (
        ua.includes("mac os") ||
        ua.includes("macintosh") ||
        ua.includes("iphone") ||
        ua.includes("ipad")
    );
});

/**
 * True when the app is running as an installed PWA (launched from the home-screen
 * icon in standalone mode), as opposed to a normal browser tab. Used to widen the
 * content sync window for installed users. Evaluated once at startup in main.ts.
 */
export const isInstalledStandalone = (): boolean => {
    if (typeof window === "undefined") return false;
    // iOS Safari home-screen apps (non-standard, predates display-mode support).
    if ((window.navigator as any).standalone === true) return true;
    if (typeof window.matchMedia !== "function") return false;
    return ["standalone", "minimal-ui", "fullscreen"].some(
        (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
};

/**
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref<LanguageDto[]>([]);

/**
 * The preferred language ID as Vue ref.
 */
export const appLanguageIdsAsRef = ref<string[]>(
    JSON.parse(localStorage.getItem("languages") || "[]") as string[],
);

// Save the preferred languages to local storage
// Note: We could have used useLocalStorage from VueUse, but it seems to be difficult
// to test as mocking localStorage is not working very well. For this reason
// we are using a watcher so that we can use the ref directly and test it easily
// without interactions with localStorage (which we choose to ignore for now in testing).
watch(
    appLanguageIdsAsRef,
    (newVal) => {
        localStorage.setItem("languages", JSON.stringify(newVal.filter((id) => id != null)));
    },
    { deep: true },
);

/**
 * Product cap on how many languages a user may prefer / sync. Enforced authoritatively by the API
 * (`QUERY_MAX_LANGUAGES`); these client-side caps keep the UI within it and give good UX. The
 * display default (English) is auto-appended in `appDisplayLanguageIdsAsRef` and is NOT counted
 * against the preferred cap, so a content query references at most cap + 1 languages.
 */
export const MAX_PREFERRED_LANGUAGES = 3;
export const MAX_SYNCED_LANGUAGES = 3;

/**
 * Normalize the preferred order: drop null/duplicate ids and cap to MAX_PREFERRED_LANGUAGES. Applied
 * on load (`initLanguage` + a module watcher, to normalize an over-cap persisted set) and on the
 * LanguageModal Save commit.
 */
export const normalizePreferredLanguages = (order: string[]): string[] =>
    [...new Set(order.filter((id) => id != null))].slice(0, MAX_PREFERRED_LANGUAGES);

/**
 * Normalize a synced-language set against the preferred order: drop ids that are no longer preferred
 * (or invalid), force-include the primary (the first preferred language) so at least one language is
 * always synced (guarantees ≥1), and cap to MAX_SYNCED_LANGUAGES. Applied at the points that can
 * break the invariant — the LanguageModal Save commit and `initLanguage`. (Since the preferred order
 * is itself capped, `synced ⊆ order` is already ≤ cap; the slice is a defensive backstop.)
 */
export const normalizeSyncedLanguages = (synced: string[], order: string[]): string[] => {
    const primary = order[0];
    let next = synced.filter((id) => id != null && order.includes(id));
    if (primary && !next.includes(primary)) next = [primary, ...next];
    return next.slice(0, MAX_SYNCED_LANGUAGES);
};

// Cap the preferred set to MAX_PREFERRED_LANGUAGES. Self-normalizing: idempotent, so the change-guard
// stops it re-firing after one convergence tick. `immediate` also normalizes an over-cap persisted set
// on load (before content sync runs), so downstream reads never see more than the cap. Declared before
// the synced ref/watcher so the preferred set is capped before the synced set is normalized against it.
watch(
    appLanguageIdsAsRef,
    (order) => {
        const normalized = normalizePreferredLanguages(order);
        const changed =
            normalized.length !== order.length || normalized.some((id, i) => id !== order[i]);
        if (changed) appLanguageIdsAsRef.value = normalized;
    },
    { deep: true, immediate: true },
);

/**
 * The set of languages the user has chosen to **sync** (download for offline) — the "Available
 * offline" checkboxes. A subset of the preferred order that always includes the primary. Drives
 * sync (`sync.ts`), the shared keep gate + fallback `$nin` (via `config.appLanguageIdsAsRef`), and
 * eviction. Distinct from the preferred *display* order (`appLanguageIdsAsRef`): a user can prefer
 * many languages for display but download only a subset.
 */
/**
 * Bumped whenever the local cache is cleared (Settings → "clear local cache" / `db.purge`). Bound to
 * the `<KeepAlive :key>` in `App.vue` so the kept-alive overview pages (Home / Explore / Watch) are
 * discarded and re-created from the now-empty cache, rather than showing their pre-purge state.
 */
export const localCacheVersion = ref(0);

export const appSyncedLanguageIdsAsRef = ref<string[]>(
    JSON.parse(localStorage.getItem("syncedLanguages") || "[]") as string[],
);
watch(
    appSyncedLanguageIdsAsRef,
    (newVal) => {
        localStorage.setItem("syncedLanguages", JSON.stringify(newVal.filter((id) => id != null)));
    },
    { deep: true },
);

// Keep the synced set seeded + normalized against the preferred order at ALL times — at module load
// (deriving from the persisted preferred languages) and whenever the preferred order changes — not
// only inside `initLanguage`. Without this, a startup timing gap could leave the synced set empty,
// which would skip content sync entirely AND break the `persistOffline` gate (no content `syncList`
// entry → `isSyncableDoc` rejects every fetched doc → nothing is written to `db.docs`).
watch(
    appLanguageIdsAsRef,
    (order) => {
        const normalized = normalizeSyncedLanguages(appSyncedLanguageIdsAsRef.value, order);
        const cur = appSyncedLanguageIdsAsRef.value;
        const changed =
            normalized.length !== cur.length || normalized.some((id, i) => id !== cur[i]);
        if (changed) appSyncedLanguageIdsAsRef.value = normalized;
    },
    { deep: true, immediate: true },
);

/**
 * The list of user selected languages sorted by preference as Vue ref.
 */
export const appLanguagesPreferredAsRef = computed(
    () =>
        appLanguageIdsAsRef.value
            .map((id) =>
                cmsLanguages.value ? cmsLanguages.value.find((l) => l._id === id) : undefined,
            )
            .filter((l) => l) as LanguageDto[],
);

/**
 * The preferred language's ID as Vue ref.
 */
export const appLanguagePreferredIdAsRef = computed(() =>
    appLanguageAsRef.value ? appLanguageAsRef.value._id : undefined,
);

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = computed(() => cmsLanguages.value.find((l) => l.default === 1));

/**
 * The user's selected (synced) languages PLUS the CMS default appended as the final display
 * fallback (when not already selected). This drives the display-side language-priority selection
 * (`mangoIsPublished`) so a post with no selected translation still resolves deterministically to
 * the default and renders as a single tile — WITHOUT the default being synced. The synced set
 * (`appLanguageIdsAsRef`) intentionally excludes the default; content the user lacks a selected
 * translation for is fetched on demand and kept by the live language-priority gate.
 */
export const appDisplayLanguageIdsAsRef = computed<string[]>(() => {
    const defaultId = cmsDefaultLanguage.value?._id;
    if (defaultId && !appLanguageIdsAsRef.value.includes(defaultId)) {
        return [...appLanguageIdsAsRef.value, defaultId];
    }
    return appLanguageIdsAsRef.value;
});

/**
 * The preferred language document as Vue ref.
 * This is automatically updated when appLanguagesPreferredAsRef changes.
 */
export const appLanguageAsRef = computed(() => appLanguagesPreferredAsRef.value[0]);

/**
 * Initialize the language settings. If no user preferred language is set, the browser preferred language is used if it is supported. Otherwise, the CMS default language is used.
 */
export const initLanguage = () => {
    return new Promise<void>((resolve) => {
        // Language is a fully-synced type, so this HybridQuery reads from IndexedDB
        // only. Constructed at app scope (never disposed) — its output ref feeds the
        // shared cmsLanguages list.
        const languagesQuery = new HybridQuery<LanguageDto>(
            { selector: { type: DocType.Language } },
            { live: true },
        );

        // Watch for CMS languages and update cmsLanguages
        watch(
            languagesQuery.output,
            (newVal) => {
                // Clear and update cmsLanguages
                cmsLanguages.value.length = 0;
                cmsLanguages.value.push(...newVal);
            },
            { deep: true },
        );

        // Wait for cmsLanguages to populate before resolving so the i18n watcher
        // has loaded translations by the time the splash screen ends.
        const unwatchCmsLanguages = watch(
            cmsLanguages,
            (_languages) => {
                if (!_languages || _languages.length === 0) return;

                // Filter out invalid language IDs and cap to the preferred-language limit.
                appLanguageIdsAsRef.value = normalizePreferredLanguages(
                    appLanguageIdsAsRef.value.filter((id) =>
                        _languages.some((lang) => lang._id === id),
                    ),
                );

                // If user still has no preferred languages, set browser preferred or CMS default
                if (appLanguageIdsAsRef.value.length === 0) {
                    // Try browser preferred language first
                    const browserPreferredLanguageId = _languages.find((l) =>
                        navigator.languages.includes(l.languageCode),
                    )?._id;

                    if (browserPreferredLanguageId) {
                        appLanguageIdsAsRef.value = [browserPreferredLanguageId];
                    } else {
                        // Fall back to CMS default language
                        const cmsDefaultLang = _languages.find((l) => l.default === 1);
                        if (cmsDefaultLang) {
                            appLanguageIdsAsRef.value = [cmsDefaultLang._id];
                        }
                    }
                }
                // NB: the CMS default language is intentionally NOT force-added to the preferred
                // (display) order. A post with no translation in the user's selected languages is
                // shown via on-demand fetch + the live language-priority keep gate, and the default
                // remains the display fallback through `appDisplayLanguageIdsAsRef` — so it no
                // longer needs to be synced to every device.

                // Normalize the synced set against the (now-validated) preferred order: drop invalid
                // ids and force-include the primary, so at least one language is always synced.
                appSyncedLanguageIdsAsRef.value = normalizeSyncedLanguages(
                    appSyncedLanguageIdsAsRef.value,
                    appLanguageIdsAsRef.value,
                );

                unwatchCmsLanguages();
                resolve();
            },
            { deep: true },
        );
    });
};

export type mediaProgressEntry = {
    mediaId: string;
    contentId: Uuid;
    progress: number;
    duration: number;
};

const _mediaProgress = JSON.parse(localStorage.getItem("mediaProgress") || "[]").filter(
    (item: mediaProgressEntry) => item.duration !== Infinity,
) as mediaProgressEntry[];

/**
 * Get the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @returns - Playback progress in seconds
 */
export const getMediaProgress = (mediaId: string, contentId: Uuid) => {
    return (
        _mediaProgress.find((p) => p.mediaId === mediaId && p.contentId === contentId)?.progress ||
        0
    );
};

/**
 * Get the duration of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @returns - Duration time in seconds
 */
export const getMediaDuration = (mediaId: string, contentId: Uuid): number => {
    return (
        _mediaProgress.find((p) => p.mediaId === mediaId && p.contentId === contentId)?.duration ||
        0
    );
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

    const index = _mediaProgress.findIndex(
        (p) => p.mediaId === mediaId && p.contentId === contentId,
    );
    if (index >= 0) {
        _mediaProgress.splice(index, 1);
    }

    _mediaProgress.unshift({ mediaId, contentId, progress, duration });

    // Only keep the last 10 progress entries
    if (_mediaProgress.length > 10) {
        _mediaProgress.splice(10);
    }

    localStorage.setItem("mediaProgress", JSON.stringify(_mediaProgress));
};

/**
 * Remove the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 */
export const removeMediaProgress = (mediaId: string, contentId: Uuid) => {
    const index = _mediaProgress.findIndex(
        (p) => p.mediaId === mediaId && p.contentId === contentId,
    );
    if (index >= 0) {
        _mediaProgress.splice(index, 1);
        localStorage.setItem("mediaProgress", JSON.stringify(_mediaProgress));
    }
};

/**
 * Global media queue for audio playback.
 * Contains ContentDto items that should be played in sequence.
 */
export const mediaQueue = ref<ContentDto[]>([]);

/**
 * Add content to the media queue and start playing if it's the first item.
 * @param content - The content to add to the queue
 */
export const addToMediaQueue = (content: ContentDto) => {
    // Check if content has audio files
    if (!content.parentMedia?.fileCollections?.length) {
        console.warn("Content has no audio files to play");
        return;
    }

    // Check if content is already in queue
    const existingIndex = mediaQueue.value.findIndex((item) => item._id === content._id);
    if (existingIndex !== -1) {
        // If already in queue, move it to the front
        mediaQueue.value.splice(existingIndex, 1);
    }

    // Add to front of queue
    mediaQueue.value.unshift(content);
};

/**
 * Remove content from the media queue.
 * @param contentId - The ID of the content to remove
 */
export const removeFromMediaQueue = (contentId: string) => {
    const index = mediaQueue.value.findIndex((item) => item._id === contentId);
    if (index !== -1) {
        mediaQueue.value.splice(index, 1);
    }
};

/**
 * Clear the entire media queue.
 */
export const clearMediaQueue = () => {
    mediaQueue.value = [];
};

/**
 * Move to the next item in the media queue.
 */
export const nextInMediaQueue = () => {
    if (mediaQueue.value.length > 1) {
        mediaQueue.value.shift(); // Remove first item
    } else {
        clearMediaQueue(); // Clear if it was the last item
    }
};

type Bookmark = {
    id: Uuid;
    ts: number;
};

export type UserPreferences = {
    bookmarks?: Array<Bookmark>;
    privacyPolicy?: { status: "accepted" | "necessaryOnly"; ts: number };
};

/**
 * The user preferences as Vue ref.
 */
export const userPreferencesAsRef = ref(
    JSON.parse(localStorage.getItem("userPreferences") || "{}") as UserPreferences,
);
watch(userPreferencesAsRef.value, (newVal) => {
    localStorage.setItem("userPreferences", JSON.stringify({ ...newVal }));
});

/**
 * Query string parameters captured on app startup
 */
export const queryParams = new URLSearchParams(window.location.search);

const _theme = ref(localStorage.getItem("theme") || "system");

/**
 * The selected theme as Vue ref.
 */
export const theme = computed<"system" | "dark" | "light">({
    get: () => {
        if (_theme.value != "dark" && _theme.value != "light") return "system";
        return _theme.value;
    },
    set: (value) => {
        _theme.value = value;
        localStorage.setItem("theme", value);
    },
});

/**
 * Returns true if the theme is dark, false if it is light. When the theme is set to "System", it returns true if the system's preferred color scheme is dark.
 */
export const isDarkTheme = ref(document.documentElement.classList.contains("dark"));

// Live-syncs with OS `prefers-color-scheme` while theme === "system". The matchMedia check inside the watcher alone only runs on in-app theme changes — without this listener, a user flipping OS dark mode mid-session wouldn't update the app.
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const applySystemTheme = () => {
    if (systemThemeQuery.matches) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
    isDarkTheme.value = document.documentElement.classList.contains("dark");
};

// Watch the theme and apply to the document's CSS classes
watch(
    theme,
    (t) => {
        // Remove any existing system theme listener before re-evaluating
        systemThemeQuery.removeEventListener("change", applySystemTheme);

        if (t === "system") {
            applySystemTheme();
            // Keep dark class in sync when the OS theme changes
            systemThemeQuery.addEventListener("change", applySystemTheme);
        } else if (t === "dark") {
            document.documentElement.classList.add("dark");
            isDarkTheme.value = true;
        } else {
            document.documentElement.classList.remove("dark");
            isDarkTheme.value = false;
        }
    },
    { immediate: true },
);

export const fallbackImageUrls = loadFallbackImageUrls();

/**
 * True while the app's Startup function is still running. Used to display the loading splash screen.
 */
export const isAppLoading = ref(!new URLSearchParams(window.location.search).has("nosplash"));

export type ReadingProgress = {
    contentId: Uuid;
    progress: number; // Progress in percentage (0–100)
};

export const readingProgressAsRef = ref<ReadingProgress[]>([]);

function readReadingProgressFromStorage(): ReadingProgress[] {
    try {
        const list = JSON.parse(localStorage.getItem("readingProgress") || "[]");
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function applyReadingProgressList(list: ReadingProgress[]) {
    _readingProgress.length = 0;
    _readingProgress.push(...list);
    readingProgressAsRef.value = [..._readingProgress];
}

const _readingProgress: ReadingProgress[] = readReadingProgressFromStorage();

readingProgressAsRef.value = [..._readingProgress];

/** Reload reading progress from localStorage into the reactive ref (e.g. after cross-tab updates). */
export function syncReadingProgressFromStorage(): void {
    applyReadingProgressList(readReadingProgressFromStorage());
}

/** Listen for `storage` events on the readingProgress key. Returns a cleanup function. */
export function watchReadingProgressStorage(): () => void {
    const onStorage = (e: StorageEvent) => {
        if (e.key === "readingProgress" || e.key === null) {
            syncReadingProgressFromStorage();
        }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}

/**
 * Get the reading progress of a content item.
 * @param contentId - The content document ID.
 * @returns - Reading progress in percentage (0–100)
 */
export const getReadingProgress = (contentId: Uuid): number => {
    const entry = _readingProgress.find((p) => p.contentId === contentId);
    return entry ? entry.progress : 0;
};

/**
 * Set the reading progress of a content item.
 * If it already exists, update it; otherwise, insert it.
 * @param contentId - The content document ID.
 * @param progress - Progress percentage (0–100)
 */
export const setReadingProgress = (contentId: Uuid, progress: number) => {
    const clampedProgress = Math.min(Math.max(progress, 0), 100);
    const index = _readingProgress.findIndex((p) => p.contentId === contentId);

    if (index !== -1) {
        _readingProgress[index].progress = clampedProgress;
    } else {
        _readingProgress.push({ contentId, progress: clampedProgress });
    }

    applyReadingProgressList([..._readingProgress]);

    localStorage.setItem("readingProgress", JSON.stringify(_readingProgress));
};

/**
 * Remove reading progress for a given content.
 */
export const removeReadingProgress = (contentId: Uuid) => {
    const index = _readingProgress.findIndex((p) => p.contentId === contentId);
    if (index !== -1) {
        _readingProgress.splice(index, 1);
    }

    applyReadingProgressList([..._readingProgress]);

    localStorage.setItem("readingProgress", JSON.stringify(_readingProgress));
};
