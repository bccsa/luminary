import { nextTick, watch, type WatchHandle } from "vue";
import { createI18n, type I18n } from "vue-i18n";
import { appLanguageAsRef, appName, cmsDefaultLanguage } from "./globalConfig";
import router from "./router";

/**
 * Create the i18n instance and wire up a watcher that keeps messages and the
 * active locale in sync with the app/CMS language refs. Returns synchronously
 * so the plugin can be installed before `app.mount()` — components that call
 * `useI18n()` during setup (e.g. SearchModal) would otherwise throw.
 */
export const initI18n = (): I18n<{}, {}, {}, string, false> => {
    const i18n = createI18n({ legacy: false });

    watch(
        [appLanguageAsRef, cmsDefaultLanguage],
        ([newLanguage, defaultLang]) => {
            if (!newLanguage || !defaultLang) return;

            const messages: Record<string, string> = {};
            Object.keys(newLanguage.translations || {}).forEach((k: string) => {
                messages[k] = newLanguage.translations[k];
            });

            if (defaultLang && defaultLang.translations && newLanguage._id != defaultLang._id) {
                Object.keys(defaultLang.translations).forEach((k: string) => {
                    if (!messages[k]) {
                        messages[k] = defaultLang.translations[k];
                    }
                });
            }

            i18n.global.setLocaleMessage(newLanguage.languageCode, messages);
            i18n.global.locale.value = newLanguage.languageCode;
        },
        { immediate: true, deep: true },
    );

    return i18n;
};

/**
 * Initialize the app title based on the route
 */
export const initAppTitle = (i18n: I18n<{}, {}, {}, string, false>) => {
    const { t } = i18n.global;

    // Update the document title based on the route
    let unwatch: WatchHandle | undefined;

    // Helper function to set the title for a route
    const setTitleForRoute = (to: any) => {
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
    };

    // Set the initial title for the current route
    setTitleForRoute(router.currentRoute.value);

    router.afterEach((to) => {
        setTitleForRoute(to);
    });

    router.beforeEach(() => {
        if (unwatch) unwatch();
        unwatch = undefined;
    });
};
