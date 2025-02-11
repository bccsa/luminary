import { db, type LanguageDto } from "luminary-shared";
import { ref, watch } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const clientAppUrl = ref(import.meta.env.VITE_CLIENT_APP_URL);
export const logo = import.meta.env.VITE_LOGO;
export const isDevMode = import.meta.env.DEV;

/**
 * The preferred CMS language ID as Vue ref.
 */
export const cmsLanguageIdAsRef = ref(localStorage.getItem("cms_selectedLanguage") || "");
watch(
    cmsLanguageIdAsRef,
    (newVal) => {
        localStorage.setItem("cms_selectedLanguage", newVal);
    },
    { deep: true },
);

export async function initLanguage() {
    const languages = (await db.docs.where("type").equals("language").toArray()) as LanguageDto[];
    const browserPreferredLanguage = navigator.languages[0];

    if (languages.some((lang) => lang.languageCode == browserPreferredLanguage)) {
        cmsLanguageIdAsRef.value = languages.filter(
            (lang) => lang.languageCode === browserPreferredLanguage,
        )[0]._id;
    } else {
        cmsLanguageIdAsRef.value = languages.filter((lang) => lang.default === 1)[0]._id;
    }
}
