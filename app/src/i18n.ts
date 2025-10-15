import { nextTick, watch, type WatchHandle } from "vue";
import { createI18n, type I18n } from "vue-i18n";
import { appLanguageAsRef, appName, cmsDefaultLanguage } from "./globalConfigOld";
import router from "./router";

/**
 * Initialize i18n with the app language, using the default language as fallback
 */
export const initI18n = () => {
    return new Promise<I18n>((resolve) => {
        // Initialize i18n with empty messages
        const i18n = createI18n({ legacy: false });

        // Wait for the app language to be set before resolving
        watch(
            i18n.global.locale,
            () => {
                resolve(i18n);
            },
            { once: true },
        );

        // Create a list of localized strings with fallback to the default language if not existing in the preferred language
        watch(
            [appLanguageAsRef, cmsDefaultLanguage],
            ([newLanguage, defaultLang]) => {
                if (!newLanguage || !defaultLang) return;
                // copy translations in the preferred language
                const messages: Record<string, string> = {};
                Object.keys(newLanguage.translations || {}).forEach((k: string) => {
                    messages[k] = newLanguage.translations[k];
                });

                // Fill in missing translations with default language strings
                if (defaultLang && defaultLang.translations && newLanguage._id != defaultLang._id) {
                    Object.keys(defaultLang.translations).forEach((k: string) => {
                        if (!messages[k]) {
                            messages[k] = defaultLang.translations[k];
                        }
                    });
                }

                // Add new translations to i18n
                i18n.global.setLocaleMessage(newLanguage.languageCode, messages);

                // Change the active locale
                i18n.global.locale.value = newLanguage.languageCode;
            },
            { immediate: true, deep: true },
        );
    });
};

/**
 * Initialize the app title based on the route
 */
export const initAppTitle = (i18n: I18n<{}, {}, {}, string, false>) => {
    const { t } = i18n.global;

    // Update the document title based on the route
    let unwatch: WatchHandle | undefined;
    router.afterEach((to) => {
        // We handle content in SingleContent.vue
        if (to.name == "content") return;

        unwatch = watch(
            i18n.global.locale,
            () => {
                nextTick(() => {
                    document.title = to.meta.title
                        ? `${t(to.meta.title as string)} - ${appName}`
                        : appName;
                });
            },
            { immediate: true },
        );
    });

    router.beforeEach(() => {
        if (unwatch) unwatch();
        unwatch = undefined;
    });
};
