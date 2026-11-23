// SSG CLIENT runtime — dynamically imported ONLY on the client (main.web.ts's
// `else` branch of `import.meta.env.SSR`), so its heavy, side-effectful imports
// (shared init/sync, app sync watchers) never load during the Node prerender.
// Boots the same data layer the normal SPA uses (minus the service worker/auth),
// so prerendered pages hydrate into a live, interactive SPA.

import type { App } from "vue";
import type { Router } from "vue-router";
import { getSocket, init, warmMangoCaches } from "luminary-shared";
import { apiUrl, appLanguageIdsAsRef, initLanguage } from "@/globalConfig";
import { APP_DOCS_INDEX } from "@/docsIndex";
import { initAuthLangSync, initSync } from "@/sync";

/**
 * Boots the shared data layer on the SSG client after hydration. Named to match
 * this folder's `Ssg*` convention (not `initWebClient` / `initSSRClient`) so
 * "which side of the prerender am I on" is always spelled the same way.
 */
export async function initSsgClient(): Promise<void> {
    warmMangoCaches();

    // Awaited: sets shared config, opens Dexie, creates the socket, starts sync2.
    // Resolves once Dexie is open (it does not block on the initial network sync).
    await init({
        cms: false,
        docsIndex: APP_DOCS_INDEX,
        apiUrl,
        appLanguageIdsAsRef,
    });

    // Connect for anonymous/public users and start the content + language sync.
    // Not awaited — these resolve over the network after the page has mounted.
    getSocket().connect();
    initAuthLangSync();
    void initLanguage();
    initSync();
}

/**
 * Installs the promotion plugin once the prerendered page has hydrated, so the static HTML and the first client
 * render both carry its empty holder and only a later fill re-renders the placements. Its module loads only then, so
 * neither its download nor a failure of it stands in the way of the data layer, auth or the mount.
 */
export function installSsgAppPromo(app: App, router: Router): void {
    // The mount follows router readiness within the same microtask run; a timer lands after it.
    void router
        .isReady()
        .then(() => new Promise((resolve) => setTimeout(resolve)))
        .then(() => import("virtual:app-promo"))
        .then(({ installAppPromo }) => installAppPromo(app))
        .catch((error: unknown) => console.error(error));
}
