// Web/SSG CLIENT runtime. This module is dynamically imported ONLY on the client
// (from main.web.ts behind an isClient guard), so neither it nor its heavy,
// side-effectful imports (shared init/sync, app sync watchers) ever load during
// the Node prerender.
//
// It boots the same data layer the native app uses (minus the service worker and,
// for now, auth/analytics) so the prerendered pages hydrate cleanly into a live,
// interactive SPA. `init()` is awaited by the caller BEFORE mount so the shared
// config/Dexie exist when components (e.g. ApiLiveQuery in SingleContent) set up
// during hydration. Language + sync are kicked off but NOT awaited, so hydration
// is not blocked on the network — they layer in after mount.

import { getSocket, init, warmMangoCaches } from "luminary-shared";
import { apiUrl, appLanguageIdsAsRef, initLanguage } from "@/globalConfig";
import { APP_DOCS_INDEX } from "@/docsIndex";
import { initAuthLangSync, initSync } from "@/sync";

export async function initWebClient(): Promise<void> {
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
