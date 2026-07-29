import type { ContentDto } from "luminary-shared";

/**
 * SSR-authored response-cache entries omit `text` (the article body) on purpose — it
 * already sits in the prerendered `[data-ssr-article-text]` node the same HTML shipped,
 * so caching it a second time would duplicate the heaviest field on the page. On the
 * client, before first render, recover it from that node instead of leaving it blank
 * (which would fight the server-rendered DOM on hydration).
 *
 * A no-op (returns `undefined`) when `doc` already carries `text` — e.g. a warm
 * client-written cache entry, which is never text-stripped since a plain client-side
 * navigation has no pre-rendered DOM to recover from — or when no matching node exists
 * (no article body to begin with).
 */
export function recoverSsrArticleText(
    doc: ContentDto | undefined,
    querySelector: (selector: string) => { innerHTML: string } | null,
): ContentDto | undefined {
    if (!doc || doc.text !== undefined) return undefined;
    const el = querySelector("[data-ssr-article-text]");
    if (!el) return undefined;
    return { ...doc, text: el.innerHTML };
}
