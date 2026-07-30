// Entry point for the web build (vite.config.web.ts → `npm run build:web`). This one
// file runs twice: once in Node during the SSG prerender pass (SSR, produces the static
// HTML crawlers see) and once in the browser as that HTML hydrates into a live app (the
// experience a normal web visitor actually gets). `import.meta.env.SSR` below branches
// between the two. The native/SPA build keeps using `main.ts` unchanged.
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

const LANGUAGES_QUERY = { selector: { type: DocType.Language } };

// The language list is identical for every prerendered page, so fetch it ONCE per
// build (the full ~2k-route build otherwise re-fetches + re-allocates it per page).
let ssgLanguages: LanguageDto[] | undefined;

// The language a given route is prerendered in: the content's own language for a
// content/tag slug, else the CMS default. The slug→lang map + default are built by
// the route enumeration in vite.config.web.ts and shared via globalThis (same Node
// process). Drives the published-content filter + the dependency-key scoping, so a
// page's feeds (and its chrome's UI strings) render in its own language.
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

        // Make the render language + its translations available BEFORE i18n installs,
        // so i18n's immediate watch emits real UI strings (not raw `menu.home` keys)
        // into the static HTML, and the first client render matches. Languages are
        // public reference data; the render + default language docs ride vite-ssg's
        // `initialState` so the client has them synchronously before mount.
        if (import.meta.env.SSR) {
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

        app.use(initI18n());

        // SSG output is already-rendered HTML — there is no splash screen. Setting this
        // on BOTH the SSR (Node prerender) and client (hydration) branches keeps the
        // first client render identical to the SSR output (clean hydration).
        isAppLoading.value = false;

        if (import.meta.env.SSR) {
            // Expose any per-page store state (e.g. SingleContent hreflang alternates)
            // for vite-ssg to serialize after the page's onServerPrefetch hooks run.
            initialState.pinia = pinia.state.value;
        } else {
            // Restore the per-slug snapshot BEFORE mount so the first client render
            // matches the prerendered HTML.
            if (initialState.pinia) {
                pinia.state.value = initialState.pinia;
            }

            // Boot the data layer BEFORE mount (vite-ssg awaits this fn before
            // mounting) so the app hydrates into a live, interactive SPA. Dynamically
            // imported so none of it loads during the Node prerender. Failure must not
            // block mount — the prerendered content is still shown.
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
