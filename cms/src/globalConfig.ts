import {
    AclPermission,
    db,
    DocType,
    useDexieLiveQuery,
    verifyAccess,
    type LanguageDto,
} from "luminary-shared";
import { ref, watch, watchEffect } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const clientAppUrl = ref(import.meta.env.VITE_CLIENT_APP_URL);
export const logo = import.meta.env.VITE_LOGO;
export const isDevMode = import.meta.env.DEV;

/**
 * The preferred CMS language ID as Vue ref.
 */
export const cmsLanguageIdAsRef = ref(localStorage.getItem("cms_selectedLanguage") || "");
watch(cmsLanguageIdAsRef, (newVal) => {
    localStorage.setItem("cms_selectedLanguage", newVal);
});

/**
 * Array of languages available in the CMS as Vue ref.
 */
export const cmsLanguagesAsRef = ref<LanguageDto[]>([]);

/**
 * Array of languages to which the CMS user have translate access to
 */
export const translatableLanguagesAsRef = ref<LanguageDto[]>([]);

export async function initLanguage() {
    if (cmsLanguageIdAsRef.value && cmsLanguagesAsRef.value.length > 1) return;

    const languages = (await db.docs.where("type").equals("language").toArray()) as LanguageDto[];
    const browserPreferredLanguage = navigator.languages[0];

    if (languages.some((lang) => lang.languageCode == browserPreferredLanguage)) {
        const preferredLang = languages.find(
            (lang) => lang.languageCode === browserPreferredLanguage,
        );
        const defaultLang = languages.find((lang) => lang.default === 1);

        cmsLanguageIdAsRef.value = preferredLang?._id || defaultLang?._id || "";
    } else {
        cmsLanguageIdAsRef.value = languages.filter((lang) => lang.default === 1)[0]._id;
    }

    const _cmsLanguages = useDexieLiveQuery(
        () =>
            db.docs.where("type").equals("language").toArray() as unknown as Promise<LanguageDto[]>,
        { initialValue: [] as LanguageDto[] },
    );
    watch(_cmsLanguages, (languages) => {
        cmsLanguagesAsRef.value = languages;
        translatableLanguagesAsRef.value = languages.filter((lang) =>
            verifyAccess(lang.memberOf, DocType.Language, AclPermission.Translate, "any"),
        );
    });
}
