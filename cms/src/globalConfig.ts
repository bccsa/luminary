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
    const languages: LanguageDto[] = (await db.docs
        .where({ type: DocType.Language })
        .toArray()) as LanguageDto[];

    cmsLanguages.value = [...languages];

    // Respect saved language
    if (cmsLanguageIdAsRef.value) {
        const exists = languages.find((l) => l._id === cmsLanguageIdAsRef.value);
        if (exists) {
            cmsDefaultLanguage.value = languages.find((l) => l.default === 1);
            return;
        }
    }

    // Browser language
    const browserLanguages = navigator.languages.map((l) => l.toLowerCase());
    const matchedBrowserLanguage = browserLanguages
        .map((browserLang) =>
            languages.find(
                (cmsLang) =>
                    browserLang === cmsLang.languageCode.toLowerCase() ||
                    browserLang.startsWith(cmsLang.languageCode.toLowerCase()),
            ),
        )
        .find(Boolean);

    if (matchedBrowserLanguage) {
        cmsLanguageIdAsRef.value = matchedBrowserLanguage._id;
    } else {
        // Default / fallback
        const defaultLang = languages.find((lang) => lang.default === 1);
        if (defaultLang) {
            cmsLanguageIdAsRef.value = defaultLang._id;
        } else if (languages.length > 0) {
            cmsLanguageIdAsRef.value = languages[0]._id;
        }
    }

    // Always assign cmsDefaultLanguage immediately
    cmsDefaultLanguage.value = languages.find((l) => l.default === 1);

    // Live query keeps them up-to-date
    const _cmsLanguages = useDexieLiveQuery(
        () =>
            db.docs.where("type").equals("language").toArray() as unknown as Promise<LanguageDto[]>,
        { initialValue: [] as LanguageDto[] },
    );

    watch(_cmsLanguages, (languages) => {
        cmsLanguages.value = [...languages];
        const defaultLang = languages.find((l) => l.default === 1);

        translatableLanguagesAsRef.value = languages.filter((lang) =>
            verifyAccess(lang.memberOf, DocType.Language, AclPermission.Translate, "any"),
        );

        if (!_.isEqual(toRaw(cmsDefaultLanguage.value), toRaw(defaultLang))) {
            cmsDefaultLanguage.value = defaultLang;
        }
    });
}
