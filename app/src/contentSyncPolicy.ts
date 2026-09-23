import { purgeSyncedContent, setContentSyncPolicy } from "luminary-shared";
import { isInstalledStandalone } from "./globalConfig";

/**
 * How much Content this launch syncs into IndexedDB (ADR 0020):
 * - `full`: installed PWA / native app — the whole corpus.
 * - `window`: logged-in browser tab — the last ~1 month; older content is fetched on demand.
 * - `none`: public browser tab — nothing; Content is served from the API by `HybridQuery`.
 */
export type ContentSyncMode = "full" | "window" | "none";

/** Sync window for logged-in browser tabs. */
export const BROWSER_CONTENT_SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // ~1 month

let mode: ContentSyncMode = "full";

/** The mode applied by {@link applyContentSyncPolicy} for this launch. */
export const contentSyncMode = (): ContentSyncMode => mode;

/** True inside the Capacitor (Play Store) shell. A TWA already reports `display-mode: standalone`. */
export const isNativeApp = (): boolean =>
    typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.() === true;

export function resolveContentSyncMode(authenticated: boolean): ContentSyncMode {
    if (isInstalledStandalone() || isNativeApp()) return "full";
    return authenticated ? "window" : "none";
}

/**
 * Decide this launch's content sync mode and configure shared accordingly. Run once auth has
 * resolved and before `initSync()`; login and logout both reload the page, so it is not re-run.
 */
export async function applyContentSyncPolicy(authenticated: boolean): Promise<ContentSyncMode> {
    mode = resolveContentSyncMode(authenticated);

    setContentSyncPolicy({
        enabled: mode !== "none",
        publishDateCutoff:
            mode === "window" ? Date.now() - BROWSER_CONTENT_SYNC_WINDOW_MS : undefined,
    });

    // A tab that synced under an earlier policy must not keep serving stale local Content.
    if (mode === "none") await purgeSyncedContent();

    return mode;
}
