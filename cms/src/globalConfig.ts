import _ from "lodash";
import {
    AclPermission,
    db,
    DocType,
    useDexieLiveQuery,
    verifyAccess,
    type LanguageDto,
} from "luminary-shared";
import { computed, ref, toRaw, watch } from "vue";

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
export const isSmallScreen = computed(() => windowWidth.value < 1500);

/**
 * The preferred CMS language ID as Vue ref.
 */
export const cmsLanguageIdAsRef = ref(localStorage.getItem("cms_selectedLanguage") || "");
watch(cmsLanguageIdAsRef, (newVal) => {
    localStorage.setItem("cms_selectedLanguage", newVal);
});

/**
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref<LanguageDto[]>([]);

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = ref<LanguageDto | undefined>();

/**
 * Array of languages to which the CMS user have translate access to
 */
export const translatableLanguagesAsRef = ref<LanguageDto[]>([]);

export async function initLanguage() {
    // Fetch all available languages

    const languages: LanguageDto[] = (await db.docs

        .where({ type: DocType.Language })

        .toArray()) as LanguageDto[];

    // Get the stored language ID

    const storedLanguageId = localStorage.getItem("cms_selectedLanguage");

    // Check if the stored language is still valid (exists in the available languages)

    const storedLanguageExists =
        storedLanguageId && languages.some((lang) => lang._id === storedLanguageId);

    // If we have a valid stored language, use it

    if (storedLanguageExists) {
        cmsLanguageIdAsRef.value = storedLanguageId!;

        console.log("Using stored language preference");
    } else {
        // No valid stored language, try to match browser preferences

        const browserLanguages = navigator.languages.map((l) => l.toLowerCase());

        const matchedBrowserLanguage = browserLanguages

            .map((browserLang) =>
                languages.find(
                    (cmsLang) =>
                        browserLang === cmsLang.languageCode.toLowerCase() ||
                        browserLang.startsWith(cmsLang.languageCode.toLowerCase()),
                ),
            )

            .find((lang) => !!lang);

        if (matchedBrowserLanguage) {
            // Set the language ID to the browser preferred language

            cmsLanguageIdAsRef.value = matchedBrowserLanguage._id;

            console.log("Using browser language preference");
        } else {
            // Find the default language

            const defaultLang = languages.find((lang) => lang.default === 1);

            if (defaultLang) {
                cmsLanguageIdAsRef.value = defaultLang._id;

                console.log("Using default language");
            }

            // If no default language is found, use the first language
            else if (languages.length > 0) {
                cmsLanguageIdAsRef.value = languages[0]._id;

                console.log("Using first available language");
            }
        }
    }

    // Set up the live query for languages

    const _cmsLanguages = useDexieLiveQuery(
        () =>
            db.docs.where("type").equals("language").toArray() as unknown as Promise<LanguageDto[]>,

        { initialValue: [] as LanguageDto[] },
    );

    // Handle language updates

    watch(_cmsLanguages, (languages) => {
        cmsLanguages.value.splice(0, cmsLanguages.value.length);

        cmsLanguages.value.push(...languages);

        const defaultLang = languages.find((l) => l.default === 1);

        translatableLanguagesAsRef.value = languages.filter((lang) =>
            verifyAccess(lang.memberOf, DocType.Language, AclPermission.Translate, "any"),
        );

        // Prevent updating if the language is the same

        if (_.isEqual(toRaw(cmsDefaultLanguage.value), toRaw(defaultLang))) return;

        cmsDefaultLanguage.value = defaultLang;

        // Validate that the current selected language still exists

        // If not, reselect using our preference logic

        const currentLanguageExists = languages.some(
            (lang) => lang._id === cmsLanguageIdAsRef.value,
        );

        if (!currentLanguageExists) {
            console.log("Current language no longer available, selecting new language");

            initLanguage();
        }
    });
}
