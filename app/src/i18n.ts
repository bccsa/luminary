import { nextTick, watch, type WatchHandle } from "vue";
import { createI18n, type I18n } from "vue-i18n";
import { appLanguageAsRef, appName, cmsDefaultLanguage, cmsLanguages } from "./globalConfig";
import router from "./router";

type LanguageLike = { _id: string; languageCode: string; updatedTimeUtc?: number; translations?: Record<string, string> };

/**
 * A language's messages, with any key it doesn't define filled in from the default language.
 * Pure — same inputs, same output.
 */
function buildMessages(language: LanguageLike, defaultLang: LanguageLike): Record<string, string> {
    const messages: Record<string, string> = { ...(language.translations ?? {}) };

    if (defaultLang.translations && language._id !== defaultLang._id) {
        for (const [key, value] of Object.entries(defaultLang.translations)) {
            if (!messages[key]) messages[key] = value;
        }
    }

    return messages;
}

// Keyed by both docs' revisions, so a translation edit arriving over sync produces a new key
// and rebuilds rather than serving a stale merge. During a prerender the language docs never
// change, so this collapses ~2k per-route merges to one per language.
const messageCache = new Map<string, Record<string, string>>();

function messagesFor(language: LanguageLike, defaultLang: LanguageLike): Record<string, string> {
    const key = `${language._id}@${language.updatedTimeUtc ?? 0}|${defaultLang._id}@${defaultLang.updatedTimeUtc ?? 0}`;
    let messages = messageCache.get(key);
    if (!messages) {
        messages = buildMessages(language, defaultLang);
        messageCache.set(key, messages);
    }
    return messages;
}

/**
 * Create the i18n instance and point it at the active language. Returns synchronously so the
 * plugin can be installed before `app.mount()` — components that call `useI18n()` during setup
 * (e.g. SearchModal) would otherwise throw.
 */
export const initI18n = (renderLanguageId?: string): I18n<{}, {}, {}, string, false> => {
    const i18n = createI18n({ legacy: false });

    const applyLanguage = (language: LanguageLike | undefined, defaultLang: LanguageLike | undefined) => {
        if (!language || !defaultLang) return;
        i18n.global.setLocaleMessage(language.languageCode, messagesFor(language, defaultLang));
        i18n.global.locale.value = language.languageCode;
    };

    // The prerender calls this once per route, and the render language is already fixed by the
    // time it does. A watcher here would never be disposed (this runs outside any component
    // scope), so every page's watcher would stay live and re-fire on every later page's language
    // — quadratic work plus a retained i18n instance per route.
    //
    // The caller passes the language explicitly rather than letting this read the shared
    // `appLanguageAsRef`, which concurrent renders overwrite (see ssg/renderLanguage.ts).
    if (import.meta.env.SSR) {
        const language = renderLanguageId
            ? cmsLanguages.value.find((l) => l._id === renderLanguageId)
            : appLanguageAsRef.value;
        applyLanguage(language, cmsDefaultLanguage.value);
        return i18n;
    }

    // Client: the language genuinely changes at runtime (LanguageModal), and this instance
    // lives as long as the app, so the subscription is correct here.
    watch(
        [appLanguageAsRef, cmsDefaultLanguage],
        ([newLanguage, defaultLang]) => applyLanguage(newLanguage, defaultLang),
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
