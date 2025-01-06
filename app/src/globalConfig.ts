import { db, DocType, type LanguageDto, type Uuid } from "luminary-shared";
import { readonly, ref, watch } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;

// Note: We could have used useLocalStorage from vueuse, but it seems to be difficult
// to test as mocking localStorage is not working very well. For this reason
// we are using a watcher so that we can use the ref directly and test it easily
// without interactions with localStorage (which we choose to ignore for now in testing).

/**
 * The preferred language ID as Vue ref.
 */
export const appLanguageIdsAsRef = ref<string[]>(
    JSON.parse(localStorage.getItem("languages") || "[]") || ([] as string[]),
);

watch(
    appLanguageIdsAsRef,
    (newVal) => {
        console.info("Setting languages", newVal);
        localStorage.setItem("languages", JSON.stringify(newVal));
    },
    { deep: true },
);

const _appLanguagesAsRef = ref<LanguageDto[] | undefined>([]);
/**
 * The preferred language document as Vue ref.
 */
export const appLanguagesAsRef = readonly(_appLanguagesAsRef);

export const languagesPreferredByBrowser = navigator.languages;

export const initLanguage = () => {
    const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

    // Set the preferred language to the preferred language returned by the browser if it is not set
    // The language is only set if there is a supported language for it otherwise it defaults to english
    watch(languages, (newVal) => {
        if (
            newVal.length > 0 &&
            (!appLanguageIdsAsRef.value ||
                !newVal.some((l) => l._id === appLanguageIdsAsRef.value[0]))
        ) {
            // Check for the preferred language in the available languages
            const preferredLanguageId = newVal.find((l) =>
                languagesPreferredByBrowser.includes(l.languageCode),
            )?._id;

            // If a preferred language exists, set it
            if (preferredLanguageId) {
                appLanguageIdsAsRef.value[0] = preferredLanguageId;
            } else {
                // If no preferred language found, check for the first supported language
                const firstSupportedLanguageId = newVal[0]._id; // Assuming the first language is the default if none found in preferences

                // Set to first supported language
                appLanguageIdsAsRef.value[0] = firstSupportedLanguageId;
            }
        }
    });

    // Set the preferred language document
    watch(
        [appLanguageIdsAsRef, languages],
        () => {
            if (appLanguageIdsAsRef.value && languages.value.length > 0) {
                _appLanguagesAsRef.value = appLanguageIdsAsRef.value.map((id) => {
                    return languages.value.find((l) => l._id === id) as LanguageDto;
                });
            }
        },
        { deep: true },
    );
};

export type mediaProgressEntry = {
    mediaId: string;
    contentId: Uuid;
    progress: number;
};

const _mediaProgress = JSON.parse(
    localStorage.getItem("mediaProgress") || "[]",
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
 * Set the playback progress of a media item.
 * @param mediaId - The media unique identifier
 * @param contentId - The content document ID.
 * @param progress - Playback progress in seconds
 */
export const setMediaProgress = (mediaId: string, contentId: Uuid, progress: number) => {
    const index = _mediaProgress.findIndex(
        (p) => p.mediaId === mediaId && p.contentId === contentId,
    );
    if (index >= 0) {
        _mediaProgress.splice(index, 1);
    }

    _mediaProgress.push({ mediaId, contentId, progress });

    // Only keep the last 10 progress entries
    while (_mediaProgress.length > 10) {
        _mediaProgress.shift();
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

type Bookmark = {
    id: Uuid;
    ts: number;
};

export type UserPreferences = {
    bookmarks?: Array<Bookmark>;
    privacyPolicy?: { status: "accepted" | "declined"; ts: number };
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
