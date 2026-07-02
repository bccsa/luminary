import _ from "lodash";
import {
    AclPermission,
    db,
    DocType,
    useSharedHybridQuery,
    verifyAccess,
    type LanguageDto,
} from "luminary-shared";
import { computed, effectScope, ref, toRaw, watch } from "vue";

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
export const clientAppUrl = ref(import.meta.env.VITE_CLIENT_APP_URL);
export const logo = import.meta.env.VITE_LOGO;
export const isDevMode = import.meta.env.DEV;
export const isTestEnviroment = import.meta.env.MODE === "test";

const windowWidth = ref(window.innerWidth);
window.addEventListener("resize", () => {
    windowWidth.value = window.innerWidth;
});
export const isMobileScreen = computed(() => windowWidth.value < 1024);
export const isSmallScreen = computed(() => windowWidth.value < 1500);
export const sidebarSectionExpanded = ref({ posts: false, tags: false, access: false });

/**
 * The preferred CMS language ID as Vue ref.
 */
export const cmsLanguageIdAsRef = ref(
    typeof localStorage !== "undefined" ? localStorage.getItem("cms_selectedLanguage") || "" : "",
);
watch(cmsLanguageIdAsRef, (newVal) => {
    if (typeof localStorage !== "undefined") localStorage.setItem("cms_selectedLanguage", newVal);
});

/**
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref<LanguageDto[]>([]);

/**
 * Array of CMS language IDs as Vue ref.
 */
export const cmsLanguageIdsAsRef = computed(() => cmsLanguages.value.map((lang) => lang._id));

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = ref<LanguageDto | undefined>();

/**
 * Array of languages to which the CMS user have translate access to
 */
export const translatableLanguagesAsRef = ref<LanguageDto[]>([]);

export async function initLanguage() {
    if (cmsLanguageIdAsRef.value && cmsLanguages.value.length > 1) return;

    const languages: LanguageDto[] = (await db.docs
        .where({ type: DocType.Language })
        .toArray()) as LanguageDto[];

    // Check for the browser preferred language in the list of available content languages
    const browserLanguages = navigator.languages.map((l) => l.toLowerCase());

    const matchedBrowserLanguage = browserLanguages
        .map((browserLang) =>
            languages.find(
                (cmsLang) =>
                    browserLang === cmsLang.languageCode.toLowerCase() ||
                    // Ensure the browser languages can be retrieved in all cases, eg. where a browser language is 'en' or 'en-US'
                    browserLang.startsWith(cmsLang.languageCode.toLowerCase()),
            ),
        )
        .find((lang) => !!lang);

    if (matchedBrowserLanguage) {
        // Set the language ID to the browser preferred language
        cmsLanguageIdAsRef.value = matchedBrowserLanguage._id;
    } else {
        // Find the default language and set it as the selected language
        const defaultLang = languages.find((lang) => lang.default === 1);
        if (defaultLang) cmsLanguageIdAsRef.value = defaultLang._id;
        // If no default language is found, set the first language as the selected language
        else if (languages.length > 0) cmsLanguageIdAsRef.value = languages[0]._id;
    }

    // Language is a fully-synced type. This SHARED HybridQuery is the single language
    // subscription for the whole CMS — every reference read of `{ type: language }`
    // (sidebar, modals, overviews) reuses this same instance, so there is one Dexie live
    // query and at most one cold-start `/query` rather than one per call site. On a warm
    // load it routes Dexie-only; on a cold start (before sync has registered `language`) it
    // routes API-only once, then re-routes to Dexie-only automatically once sync registers
    // `language` in the syncList (the cold-start re-route in HybridQuery).
    const scope = effectScope(true);
    scope.run(() => {
        const sharedLanguages = useSharedHybridQuery<LanguageDto>(
            { selector: { type: DocType.Language } },
            { live: true },
        );

        watch(
            sharedLanguages,
            (languages) => {
                cmsLanguages.value = _.uniqBy(languages, "_id").sort((a, b) =>
                    a._id > b._id ? 1 : -1,
                );

                const defaultLang = languages.find((l) => l.default === 1);

                // If no language is selected yet (fresh session: the synchronous read above ran
                // before languages had synced into Dexie), select now that they've arrived.
                if (!cmsLanguageIdAsRef.value && languages.length) {
                    cmsLanguageIdAsRef.value = (defaultLang ?? languages[0])._id;
                }

                translatableLanguagesAsRef.value = languages.filter((lang) =>
                    verifyAccess(lang.memberOf, DocType.Language, AclPermission.Translate, "any"),
                );

                // Prevent updating the value if the language is the same
                if (_.isEqual(toRaw(cmsDefaultLanguage.value), toRaw(defaultLang))) return;

                cmsDefaultLanguage.value = defaultLang;
            },
            { immediate: true },
        );
    });
}

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
