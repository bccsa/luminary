import _ from "lodash";
import { db, DocType, useDexieLiveQuery, type LanguageDto } from "luminary-shared";
import { ref, toRaw, watch } from "vue";

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
 * The list of CMS defined languages as Vue ref.
 */
export const cmsLanguages = ref<LanguageDto[]>([]);

/**
 * The default language document as Vue ref.
 */
export const cmsDefaultLanguage = ref<LanguageDto | undefined>();

/**
 * Initialize the language settings.
 */
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

    const _cmsLanguages = useDexieLiveQuery(
        async () =>
            (await db.docs.where("type").equals(DocType.Language).toArray()) as unknown as Promise<
                LanguageDto[]
            >,
        { initialValue: [] },
    );
    watch(
        _cmsLanguages,
        (newVal) => {
            cmsLanguages.value.slice(0, cmsLanguages.value.length);
            cmsLanguages.value.push(...newVal);

            const defaultLang = newVal.find((l) => l.default === 1);

            // Prevent updating the value if the language is the same
            if (_.isEqual(toRaw(cmsDefaultLanguage.value), toRaw(defaultLang))) return;

            cmsDefaultLanguage.value = defaultLang;
        },
        { deep: true },
    );
}
