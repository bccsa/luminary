import type { ContentDto } from "luminary-shared";

// Stashed on globalThis so the capture (main.web.ts, before mount) and the consume
// (SingleContent setup) can cross the module boundary without a shared import.
const SNAPSHOT_KEY = "__SSG_ARTICLE_TEXT__";

/**
 * Client-only. Called once from `main.web.ts` before `app.mount` clears the prerendered
 * `#app` container. Snapshots the article body so the hydration recovery below can restore
 * `text`, which is stripped from the prerender cache seed to avoid shipping it twice.
 */
export function captureSsgArticleTextSnapshot(): void {
    const el = document.querySelector("[data-ssg-article-text]");
    (globalThis as Record<string, unknown>)[SNAPSHOT_KEY] = el ? el.innerHTML : null;
}

/**
 * Read-and-clear: only the first mount — the prerendered route — consumes the snapshot, so
 * a later remount or client-side navigation can't paint a different article's stashed body.
 */
export function takeSsgArticleTextSnapshot(): string | undefined {
    const g = globalThis as Record<string, unknown>;
    const html = g[SNAPSHOT_KEY];
    g[SNAPSHOT_KEY] = undefined;
    return typeof html === "string" && html.length > 0 ? html : undefined;
}

/**
 * Restore `text` (omitted from the prerender cache seed via `ssgCacheStripFields`) from the
 * prerendered-article snapshot so `v-html` matches the prerendered HTML. No-op when `doc`
 * already carries `text` (warm client cache) or no snapshot was captured.
 */
export function recoverSsgArticleText(
    doc: ContentDto | undefined,
    snapshotHtml: string | undefined,
): ContentDto | undefined {
    if (!doc || doc.text !== undefined) return undefined;
    if (!snapshotHtml) return undefined;
    return { ...doc, text: snapshotHtml };
}
