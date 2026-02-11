import {
    db,
    DocType,
    useDexieLiveQuery,
    mangoToDexie,
    type LanguageDto,
    type Uuid,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { loadFallbackImageUrls } from "./util/loadFallbackImages";

export let Sentry: typeof import("@sentry/vue") | null = null;

if (import.meta.env.PROD) {
    import("@sentry/vue")
        .then((sentryModule) => {
            Sentry = sentryModule;
        })
        .catch((e) => {
            console.error("Failed to initialize Sentry:", e);
        });
}

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;

const isTestEnv = import.meta.env.MODE === "test";

const windowWidth = ref(window.innerWidth);
window.addEventListener("resize", () => {
    windowWidth.value = window.innerWidth;
});
export const isMobileScreen = computed(() => windowWidth.value < 1024);
export const isSmallScreen = computed(() => windowWidth.value < 1500);

/**
 * We want to only show one privacy policy modal per session.
 * This is used to track one singular instance of the modal being shown.
 */
export const showPrivacyPolicyModal = ref(false);

/**
 * Gets client's connection speed in Mbps.
 */
export const getConnectionSpeed = () => {
    if (isTestEnv) return 10;

    return (
        (
            (navigator as any).connection ||
            (navigator as any).mozConnection ||
            (navigator as any).webkitConnection
        )?.downlink || 10
    );
};

/**
 * Get device information.
 * @returns
 */
export const getDeviceInfo = () => {
    return {
        platform: (navigator as any).userAgentData?.platform || navigator.platform,
        userAgent: navigator.userAgent,
        connectionSpeed: getConnectionSpeed(),
    };
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
 * The preferred language document as Vue ref.
 * This is automatically updated when appLanguagesPreferredAsRef changes.
 */
export const appLanguageAsRef = computed(() => appLanguagesPreferredAsRef.value[0]);

/**
 * Initialize the language settings. If no user preferred language is set, the browser preferred language is used if it is supported. Otherwise, the CMS default language is used.
 */
export const initLanguage = () => {
    return new Promise<void>((resolve) => {
        const _cmsLanguages = useDexieLiveQuery(
            () => mangoToDexie<LanguageDto>(db.docs, { selector: { type: DocType.Language } }),
            { initialValue: [] },
        );

        // Watch for CMS languages and update cmsLanguages
        watch(
            _cmsLanguages,
            (newVal) => {
                // Clear and update cmsLanguages
                cmsLanguages.value.length = 0;
                cmsLanguages.value.push(...newVal);
            },
            { deep: true },
        );

        // If user already has preferred languages, resolve immediately
        if (appLanguageIdsAsRef.value.length > 0) {
            resolve();
            return;
        }

        // Initialize preferred language when CMS languages are available
        const unwatchCmsLanguages = watch(
            cmsLanguages,
            (_languages) => {
                if (!_languages || _languages.length === 0) return;

                // Filter out invalid language IDs
                appLanguageIdsAsRef.value = appLanguageIdsAsRef.value.filter((id) =>
                    _languages.some((lang) => lang._id === id),
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
                } else {
                    // Ensure CMS default language is in the list if not already present
                    const cmsDefaultLang = _languages.find((l) => l.default === 1);
                    if (cmsDefaultLang && !appLanguageIdsAsRef.value.includes(cmsDefaultLang._id)) {
                        appLanguageIdsAsRef.value.push(cmsDefaultLang._id);
                    }
                }

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

// Watch the theme and apply to the document's CSS classes
watch(
    theme,
    (t) => {
        if (t === "system") {
            if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        } else if (t === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }

        isDarkTheme.value = document.documentElement.classList.contains("dark");
    },
    { immediate: true },
);

export const fallbackImageUrls = loadFallbackImageUrls();
