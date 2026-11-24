import type { Router } from "vue-router";

export const CHUNK_RELOAD_KEY = "chunkReloadBuild";

/**
 * Reloads once per build when a lazy chunk fails to load, so a page or tab that predates a
 * deploy picks up the current build. Keyed by build id: a chunk still missing after the
 * reload doesn't loop, while a later deploy can trigger a reload again.
 */
export function installChunkReload(router: Router, buildId: string, win: Window = window) {
    // A failed route chunk aborts the navigation before it's committed, so the URL still
    // shows the previous page; reload into the clicked route instead.
    let pendingHref: string | undefined;
    router.beforeEach((to) => {
        pendingHref = router.resolve(to).href;
    });
    router.afterEach(() => {
        pendingHref = undefined;
    });
    router.onError(() => {
        pendingHref = undefined;
    });

    win.addEventListener("vite:preloadError", (event) => {
        try {
            if (win.sessionStorage.getItem(CHUNK_RELOAD_KEY) === buildId) return;
            win.sessionStorage.setItem(CHUNK_RELOAD_KEY, buildId);
        } catch {
            return;
        }
        event.preventDefault();
        if (pendingHref) win.location.assign(pendingHref);
        else win.location.reload();
    });
}
