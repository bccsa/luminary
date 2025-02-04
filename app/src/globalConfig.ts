import { db, DocType, useDexieLiveQuery, type LanguageDto, type Uuid } from "luminary-shared";
import { computed, ref, watch } from "vue";

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
    JSON.parse(localStorage.getItem("languages") || "[]") as string[],
);

/**
 * Set the default language of the app.
 */
function setAppDefaultLanguage(languageId: Uuid) {
    appLanguageIdsAsRef.value = [
        languageId,
        ...appLanguageIdsAsRef.value.filter((l) => l !== languageId),
    ];
}

// Save the preferred languages to local storage
watch(
    appLanguageIdsAsRef,
    (newVal) => {
        localStorage.setItem("languages", JSON.stringify(newVal));
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
 * The preferred language document as Vue ref.
 */
export const appLanguageAsRef = computed(() =>
    appLanguagesPreferredAsRef.value.length ? appLanguagesPreferredAsRef.value[0] : undefined,
);

/**
 * The preferred language's ID as Vue ref.
 */
export const appLanguagePreferredIdAsRef = computed(() =>
    appLanguageAsRef.value ? appLanguageAsRef.value._id : undefined,
);

/**
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref<LanguageDto[]>([]);

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = ref<LanguageDto | undefined>();

/**
 * Initialize the language settings. If no user preferred language is set, the browser preferred language is used if it is supported. Otherwise, the CMS default language is used.
 */
export const initLanguage = () => {
    return new Promise<void>((resolve) => {
        const _cmsLanguages = useDexieLiveQuery(
            async () =>
                (await db.docs
                    .where("type")
                    .equals(DocType.Language)
                    .toArray()) as unknown as Promise<LanguageDto[]>,
            { initialValue: [] },
        );
        watch(_cmsLanguages, (newVal) => {
            cmsLanguages.value.slice(0, cmsLanguages.value.length);
            cmsLanguages.value.push(...newVal);
            cmsDefaultLanguage.value = newVal.find((l) => l.default === 1);
        });

        // Set the preferred language to the preferred language returned by the browser if it is not set
        // The language is only set if there is a supported language for it otherwise it defaults to the CMS configured default language
        if (appLanguageIdsAsRef.value.length === 0) {
            const unwatchCmsLanguages = watch(cmsLanguages, (_languages) => {
                if (!_languages || _languages.length == 0) return;
                if (!appLanguageIdsAsRef.value) return;

                // Check for the browser preferred language in the list of available content languages
                const browserPreferredLanguageId = _languages.find((l) =>
                    navigator.languages.includes(l.languageCode),
                )?._id;

                // If a browser preferred language exists, set it
                if (browserPreferredLanguageId) {
                    unwatchCmsLanguages();
                    setAppDefaultLanguage(browserPreferredLanguageId);
                    resolve();
                }

                // Find the CMS defined default language
                const cmsDefaultLanguage = _languages.find((l) => l.default === 1);

                // If the browser preferred language does not match any of the available content languages,
                // set the CMS defined default language as the preferred language. If no default language is defined
                // in the CMS, set the first available language as the preferred language.
                appLanguageIdsAsRef.value[0] = cmsDefaultLanguage?._id || _languages[0]._id; // ??

                // Add the CMS defined default language to the list of preferred languages if it is not already there
                if (
                    cmsDefaultLanguage &&
                    !appLanguageIdsAsRef.value.some((l) => l === cmsDefaultLanguage._id)
                ) {
                    appLanguageIdsAsRef.value.push(cmsDefaultLanguage._id);
                }

                unwatchCmsLanguages();
                resolve();
            });
        }

        resolve();
    });
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
