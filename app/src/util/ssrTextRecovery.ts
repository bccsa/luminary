import type { ContentDto } from "luminary-shared";

/**
 * Recover the article `text` from the prerendered `[data-ssr-article-text]` node before first render. SSR cache entries omit `text` to avoid duplicating the heaviest field; recovering it from the DOM prevents a hydration mismatch. No-op when `doc` already carries `text` or no matching node exists.
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
