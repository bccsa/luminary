import { watch } from "vue";
import { createI18n, type I18n } from "vue-i18n";
import { appLanguageAsRef, cmsDefaultLanguage } from "./globalConfig";

/**
 * Initialize i18n with the app language, using the default language as fallback
 */
export const initI18n = () => {
    return new Promise<I18n>((resolve) => {
        // Initialize i18n with empty messages
        const i18n = createI18n({ legacy: false });

        // // Wait for the app language to be set before resolving
        // if (i18n.global.locale.value) {
        //     console.log("i18n.global.locale.value", i18n.global.locale.value);
        //     resolve(i18n);
        // } else {
        //     const unwatchAppLanguage = watch(i18n.global.locale, () => {
        //         unwatchAppLanguage();
        //         resolve(i18n);
        //     });
        // }

        // Create a list of localized strings with fallback to the default language if not existing in the preferred language
        watch(
            [appLanguageAsRef, cmsDefaultLanguage],
            ([newLanguage, defaultLang]) => {
                if (!newLanguage || !defaultLang) return;
                console.log("newLanguage", newLanguage);
                console.log("defaultLang", defaultLang);
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
                if (resolve) resolve(i18n);
            },
            { immediate: true },
        );
    });
};
