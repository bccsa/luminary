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
    if (cmsLanguageIdAsRef.value && cmsLanguages.value.length > 1) return;

    const languages: LanguageDto[] = (await db.docs
        .where({ type: DocType.Language })
        .toArray()) as LanguageDto[];

    // Ensure the browser languages can be retrieved in all cases, eg. where a browser language is 'en' or 'en-US'
    const browserPreferredLanguage = languages.find((lang) => {
        const languageCode = lang.languageCode.toLowerCase();
        return navigator.languages.some((lang) => lang.toLowerCase().startsWith(languageCode));
    });

    if (browserPreferredLanguage) {
        // Set the language ID to the browser preferred language
        cmsLanguageIdAsRef.value = browserPreferredLanguage?._id;
    } else {
        // Find the default language and set it as the selected language
        const defaultLang = languages.find((lang) => lang.default === 1);
        if (defaultLang) cmsLanguageIdAsRef.value = defaultLang._id;
        // If no default language is found, set the first language as the selected language
        else if (languages.length > 0) cmsLanguageIdAsRef.value = languages[0]._id;
    }

    const _cmsLanguages = useDexieLiveQuery(
        () =>
            db.docs.where("type").equals("language").toArray() as unknown as Promise<LanguageDto[]>,
        { initialValue: [] as LanguageDto[] },
    );
    watch(_cmsLanguages, (languages) => {
        cmsLanguages.value.slice(0, cmsLanguages.value.length);
        cmsLanguages.value.push(...languages);

        const defaultLang = languages.find((l) => l.default === 1);

        translatableLanguagesAsRef.value = languages.filter((lang) =>
            verifyAccess(lang.memberOf, DocType.Language, AclPermission.Translate, "any"),
        );

        // Prevent updating the value if the language is the same
        if (_.isEqual(toRaw(cmsDefaultLanguage.value), toRaw(defaultLang))) return;

        cmsDefaultLanguage.value = defaultLang;
    });
}
