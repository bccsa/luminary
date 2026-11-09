import { DocType, type BaseDocumentDto, type ContentDto } from "luminary-shared";

/** Upper bound on remembered docs; each keeps its article body in memory. */
export const RECENT_CONTENT_LIMIT = 100;

// Insertion order doubles as recency: a doc seen again is moved to the end.
const bySlug = new Map<string, ContentDto>();

/**
 * Remember content docs just read from IndexedDB, so an article opened from a tile can
 * render at once instead of waiting for its own read, which a busy page delays by seconds.
 */
export function rememberContent(docs: BaseDocumentDto[]): void {
    for (const raw of docs) {
        if (raw.type !== DocType.Content) continue;
        const doc = raw as ContentDto;
        if (!doc.slug) continue;
        bySlug.delete(doc.slug);
        // The search index is the largest field and is never rendered.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fts, ftsTokenCount, ...rest } = doc;
        bySlug.set(doc.slug, rest as ContentDto);
        if (bySlug.size > RECENT_CONTENT_LIMIT) bySlug.delete(bySlug.keys().next().value!);
    }
}

/** The last remembered copy of the content doc with this slug, if any. */
export function recentContentBySlug(slug: string): ContentDto | undefined {
    return bySlug.get(slug);
}

/** @internal Test-only. */
export function __resetRecentContent(): void {
    bySlug.clear();
}
