import { ref, watch } from "vue";
import { db, DocType, useDexieLiveQuery, type LanguageDto } from "luminary-shared";
import { computed, ref, watch } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const clientAppUrl = ref(import.meta.env.VITE_CLIENT_APP_URL);
export const logo = import.meta.env.VITE_LOGO;
export const isDevMode = import.meta.env.DEV;

/**
 * The preferred CMS language ID as Vue ref.
 */
export const cmsLanguageIdAsRef = ref(localStorage.getItem("cms_selectedLanguage") || "");
const defaultLanguageAsQuery = useDexieLiveQuery(
    () =>
        db.docs
            .where("type")
            .equals(DocType.Language)
            .filter((l) => {
                const language = l as LanguageDto;
                if (!language.default) return false;
                return true;
            })
            .toArray() as unknown as Promise<LanguageDto[]>,
);
export const cms_defaultLanguage = computed(() =>
    defaultLanguageAsQuery.value
        ? (defaultLanguageAsQuery.value[0] as LanguageDto)
        : ({} as LanguageDto),
);

watch(cmsLanguageIdAsRef, (newVal) => {
    localStorage.setItem("cms_selectedLanguage", newVal);
});

export async function initLanguage() {
    if (cmsLanguageIdAsRef.value) return;

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
}
