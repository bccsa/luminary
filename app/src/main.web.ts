// Entry point for the web build (vite.config.web.ts → `npm run build:web`). This one
// file runs twice: once in Node during the SSG prerender pass (SSR, produces the static
// HTML crawlers see) and once in the browser as that HTML hydrates into a live app (the
// experience a normal web visitor actually gets). `isPrerender` (`import.meta.env.SSR`)
// below branches between the two. The normal SPA build keeps using `main.ts` unchanged.
//
// Must import polyfills first so jsdom-missing globals (e.g. window.matchMedia)
// exist before globalConfig.ts and friends touch them at module load.
import "./ssg/polyfills";
import "./assets/main.css";
import { ViteSSG } from "vite-ssg";
import { createPinia } from "pinia";
import App from "./App.vue";
import { routes } from "./router/routes";
import { localizedStaticRoutes } from "./router/localizedRoutes";
import { initI18n } from "./i18n";
import { DocType, HttpReq, initHybridQuery, queryRemote, type LanguageDto } from "luminary-shared";
import { apiUrl, appLanguageIdsAsRef, cmsLanguages, isAppLoading } from "./globalConfig";
import { SSG_DISPLAY_LANGUAGES, ssgDisplayLanguages } from "./ssg/renderLanguage";
import { isPrerender } from "./ssg/isPrerender";
import { captureSsrArticleTextSnapshot } from "./util/ssrTextRecovery";

const LANGUAGES_QUERY = { selector: { type: DocType.Language } };

// The language list is identical for every prerendered page, so fetch it ONCE per
// build (the full ~2k-route build otherwise re-fetches + re-allocates it per page).
let ssgLanguages: LanguageDto[] | undefined;

// The language a route is prerendered in: the content's own language for a slug, else the CMS default. The slug→lang map is built by route enumeration and shared via globalThis; it drives the published-content filter and UI-string locale.
function ssgRouteLang(routePath?: string): string {
    const g = globalThis as Record<string, unknown>;
    const codeToId = g.__SSG_LANG_CODE_TO_ID__ as Record<string, string> | undefined;
    const map = g.__SSG_ROUTE_LANG__ as Record<string, string> | undefined;
    const def = (g.__SSG_DEFAULT_LANG__ as string) || "";
    const firstSegment = routePath?.split("/").filter(Boolean)[0];
    if (firstSegment && codeToId?.[firstSegment]) return codeToId[firstSegment];
    return (routePath && map?.[routePath]) || def;
}

function langCodeToId(langs: LanguageDto[]): Record<string, string> {
    return Object.fromEntries(langs.map((l) => [l.languageCode, l._id]).filter(([code]) => code));
}

export const createApp = ViteSSG(
    App,
    { routes },
    async ({ app, initialState, routePath, router }) => {
        const pinia = createPinia();
        app.use(pinia);
        let langs: LanguageDto[] = [];

        // Make the render language and its translations available before i18n installs so the static HTML carries real UI strings, not raw keys. The render and default language docs ride vite-ssg's `initialState` so the client has them synchronously before mount.
        if (isPrerender()) {
            const lang = ssgRouteLang(routePath);
            appLanguageIdsAsRef.value = lang ? [lang] : [];

            // Enable the shared `queryRemote` (anonymous POST /query → public tier) for
            // both the language bootstrap here and the content seam's onServerPrefetch.
            // HttpReq is fetch-only (no Dexie/socket), so this is safe in Node.
            initHybridQuery(new HttpReq(apiUrl));

            if (!ssgLanguages) ssgLanguages = await queryRemote<LanguageDto>(LANGUAGES_QUERY);
            langs = ssgLanguages;
            cmsLanguages.value = langs;

            // Serialize ALL languages so the client's first render has every
            // translation's name/code (SingleContent's language dropdown + hreflang),
            // but strip the heavy `translations` map from all except the render +
            // default language — i18n only needs those two — to keep page weight down.
            const defaultLang = langs.find((l) => l.default === 1);
            const defaultId = defaultLang?._id;

            // Per-render language, provided on this app instance rather than read from the
            // module-level ref — see ssg/renderLanguage.ts for why the ref is unsafe here.
            const displayLanguages = ssgDisplayLanguages(lang, defaultId);
            app.provide(SSG_DISPLAY_LANGUAGES, displayLanguages);

            const keep = new Set([lang, defaultId].filter(Boolean) as string[]);
            initialState.renderLang = lang;
            // Human-readable companion to renderLang: the `_id` is often a UUID, so
            // surface the language name too for anyone reading the inlined state.
            initialState.renderLangName = langs.find((l) => l._id === lang)?.name ?? "";
            initialState.langCodeToId = langCodeToId(langs);
            initialState.languages = langs.map((l) =>
                keep.has(l._id) ? l : { ...l, translations: {} },
            );
        } else {
            // Snapshot the prerendered article body before `app.mount` clears #app; the
            // hydration patch in SingleContent recovers `text` (stripped from the cache
            // seed) from this snapshot so the body survives the JS boot.
            captureSsrArticleTextSnapshot();

            // Client: take the render language from the serialized state so the first
            // render's UI strings + content match the prerendered HTML. (The web build
            // is per-URL-language; the user can still switch via the language modal.)
            const lang = (initialState.renderLang as string) || "";
            appLanguageIdsAsRef.value = lang ? [lang] : [];
            langs = (initialState.languages as LanguageDto[] | undefined) ?? [];
            if (langs.length) cmsLanguages.value = langs;
        }

        for (const route of localizedStaticRoutes(langs.map((l) => l.languageCode))) {
            router.addRoute(route);
        }

        // Explicit language: on the prerender this must not come from the shared ref.
        app.use(initI18n(isPrerender() ? ssgRouteLang(routePath) : undefined));

        // SSG output is already-rendered HTML — there is no splash screen. Setting this
        // on BOTH the SSR (Node prerender) and client (hydration) branches keeps the
        // first client render identical to the SSR output (clean hydration).
        isAppLoading.value = false;

        if (isPrerender()) {
            // Expose any per-page store state (e.g. SingleContent hreflang alternates)
            // for vite-ssg to serialize after the page's onServerPrefetch hooks run.
            initialState.pinia = pinia.state.value;
        } else {
            // Restore the per-slug snapshot BEFORE mount so the first client render
            // matches the prerendered HTML.
            if (initialState.pinia) {
                pinia.state.value = initialState.pinia;
            }

            // Boot the data layer before mount so the app hydrates into a live SPA. Dynamically imported so none of it loads during the Node prerender; a failure must not block mount since the prerendered content is still shown.
            try {
                const { initSsgClient } = await import("./ssg/clientRuntime");
                await initSsgClient();
                const { setupAuth } = await import("./auth");
                await setupAuth(app, router);
            } catch (err) {
                console.error("[ssg] client runtime/auth init failed", err);
            }
        }
    },
    {
        // vite-ssg installs @unhead/vue; components use `useHead` for SEO tags.
        useHead: true,
    },
);
