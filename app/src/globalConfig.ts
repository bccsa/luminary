import { db, DocType, useDexieLiveQuery, type LanguageDto, type Uuid } from "luminary-shared";
import { computed, ref, watch } from "vue";
import * as _ from "lodash";
import { setAppLanguages } from "./setAppLanguages";
import { watchArray } from "@vueuse/core";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;

/**
 * The preferred language IDs as Vue ref.
 */
export const appLanguageIds = ref<string[]>(
    JSON.parse(localStorage.getItem("languages") || "[]") as string[],
);

// Save the preferred languages to local storage
// Note: We could have used useLocalStorage from VueUse, but it seems to be difficult
// to test as mocking localStorage is not working very well. For this reason
// we are using a watcher so that we can use the ref directly and test it easily
// without interactions with localStorage (which we choose to ignore for now in testing).
watch(
    appLanguageIds,
    (newVal) => {
        if (!newVal) return;
        localStorage.setItem("languages", JSON.stringify(newVal.filter((id) => id != null)));
    },
    { deep: true },
);

/**
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref([] as LanguageDto[]);

/**
 * The list of user selected languages sorted by preference as Vue ref.
 */
export const appLanguageList = ref<LanguageDto[]>([]);

/**
 * The preferred language's ID as Vue ref.
 */
export const appLanguageId = ref<Uuid>();

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = ref<LanguageDto | undefined>();

/**
 * The preferred language document as Vue ref.
 */
export const appLanguageAsRef = ref<LanguageDto | undefined>();

/**
 * Initialize the language settings. If no user preferred language is set, the browser preferred language is used if it is supported. Otherwise, the CMS default language is used.
 */
export const initLanguage = async () => {
    console.log("initLanguage");
    const _cmsLanguages = db.toRef<LanguageDto[]>(
        () =>
            db.docs.where("type").equals(DocType.Language).toArray() as unknown as Promise<
                LanguageDto[]
            >,
        [],
    );
    watch(_cmsLanguages, (newVal) => {
        console.log("cmsLanguages lenght", _cmsLanguages.value.length);
        cmsLanguages.value = newVal;
    });

    // const test = await db.docs.toArray();
    // console.log("test", test);

    watch(appLanguageIds, setAppLanguages, {
        deep: true,
    });
    watch(cmsLanguages, setAppLanguages, {
        deep: true,
        immediate: true,
    });

    await new Promise<void>((resolve) => {
        // Resolve if the app language list is already set
        if (appLanguageId.value) {
            console.log("appLanguage set 1");
            resolve();
        } else {
            // Wait for the App language to be set to be loaded
            const unwatch = watch(
                appLanguageId,
                (newVal) => {
                    if (newVal) {
                        unwatch();
                        console.log("appLanguage set 2");
                        resolve();
                    }
                },
                { deep: true },
            );
        }
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

/**
 * This ref is used to control the visibility of the quick controls (dark/light mode switch, back button) in content view (SingleContent.vue).
 */
export const showContentQuickControls = ref(false);

export const loginModalVisible = ref(false);
/**
 * Show the login modal
 */
export const showLoginModal = () => {
    loginModalVisible.value = true;
};
