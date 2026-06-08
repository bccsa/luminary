// Web / SSG entry point. Used ONLY by the web build (vite.config.web.ts →
// `npm run build:web`). The native/SPA build keeps using `main.ts` unchanged.
//
// Must import polyfills first so jsdom-missing globals (e.g. window.matchMedia)
// exist before globalConfig.ts and friends touch them at module load.
import "./ssg/polyfills";
import "./assets/main.css";
import { ViteSSG } from "vite-ssg";
import { createPinia } from "pinia";
import App from "./App.vue";
import { routes } from "./router/routes";
import { initI18n } from "./i18n";
import { isAppLoading } from "./globalConfig";

export const createApp = ViteSSG(
    App,
    { routes },
    async ({ app, initialState }) => {
        const pinia = createPinia();
        app.use(pinia);
        app.use(initI18n());

        // The web tier is prerendered — there is no splash screen. Setting this
        // on BOTH server and client keeps the first client render identical to
        // the SSR output (clean hydration).
        isAppLoading.value = false;

        // IMPORTANT: use import.meta.env.SSR, NOT vite-ssg's ctx.isClient. With
        // ssgOptions.mock:true, vite-ssg computes isClient as
        // `typeof window !== "undefined"`, which jsdom makes TRUE during the Node
        // prerender — so isClient is unreliable here. import.meta.env.SSR is true
        // in the prerender bundle and false in the browser bundle.
        if (import.meta.env.SSR) {
            // Prerender (Node): expose the live store state for vite-ssg to
            // serialize after the page's onServerPrefetch hooks have run.
            initialState.pinia = pinia.state.value;
        } else {
            // Real browser client. Restore the public-tier snapshot BEFORE mount
            // so the first client render matches the prerendered HTML.
            if (initialState.pinia) {
                pinia.state.value = initialState.pinia;
            }

            // Boot the data layer BEFORE mount (vite-ssg awaits this fn before
            // mounting) so the app hydrates into a live, interactive SPA and
            // ApiLiveQuery has config during hydration. Dynamically imported so
            // none of it loads during the Node prerender. Failure must not block
            // mount — the prerendered content is still shown.
            try {
                const { initWebClient } = await import("./ssg/clientRuntime");
                await initWebClient();
            } catch (err) {
                console.error("[web] client runtime init failed", err);
            }
        }
    },
    {
        // vite-ssg installs @unhead/vue; components use `useHead` for SEO tags.
        useHead: true,
    },
);
