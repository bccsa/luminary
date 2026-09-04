// SSG CLIENT runtime — dynamically imported ONLY on the client (main.web.ts's
// `else` branch of `import.meta.env.SSR`), so its heavy, side-effectful imports
// (shared init/sync, app sync watchers) never load during the Node prerender.
// Boots the same data layer the normal SPA uses (minus the service worker/auth),
// so prerendered pages hydrate into a live, interactive SPA.

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
