import MiniSearch, { type SearchOptions, type SearchResult } from "minisearch";
import { DocType, type ContentDto, db } from "luminary-shared";
import { ref } from "vue";

/** Reactive document count — updated by every mutating operation so consumers stay in sync. */
export const searchIndexSizeRef = ref(0);

export interface LuminarySearchResult extends SearchResult {
    doc: ContentDto;
    /**
     * Highlighted text snippet showing the matching context
     */
    highlight?: string;
}

export interface LuminarySearchOptions extends SearchOptions {
    /**
     * Filter by document types. Defaults to [DocType.Content]
     */
    types?: DocType[];
    /**
     * Filter by languages. If not specified, all languages are included.
     */
    languages?: string[];
}

let miniSearch: MiniSearch<ContentDto> | null = null;

const INDEX_LOAD_BATCH_SIZE = 100;
const SEARCH_RESULT_LIMIT = 20;
const SEARCH_INDEX_KEY = "searchIndex";

const STORED_FIELDS = [
    "_id",
    "type",
    "title",
    "author",
    "summary",
    "text",
    "slug",
    "language",
    "status",
    "parentId",
    "parentImageData",
    "parentImageBucketId",
] as const;

interface StoredSearchIndex {
    version: number;
    documentCount: number;
    indexJson: string;
}

function getMiniSearchOptions() {
    return {
        idField: "_id",
        fields: ["title", "author", "summary", "text"],
        storeFields: [...STORED_FIELDS],
        searchOptions: {
            fuzzy: 0.2,
            prefix: true,
            boost: { title: 2, summary: 1.5, text: 1, author: 1 },
        },
    };
}

function createMiniSearch(): MiniSearch<ContentDto> {
    return new MiniSearch<ContentDto>(getMiniSearchOptions());
}

async function invalidateSearchIndexCache(): Promise<void> {
    try {
        await db.luminaryInternals.delete(SEARCH_INDEX_KEY);
    } catch {
        // Ignore if key did not exist
    }
}

/**
 * Extract plain text from TipTap/ProseMirror JSON content
 * @param content - The TipTap JSON string or plain text
 * @returns Plain text string
 */
function extractPlainText(content: unknown): string {
    if (!content) {
        return "";
    }

    // If it's already a string, check if it's JSON
    if (typeof content === "string") {
        try {
            const parsed = JSON.parse(content);
            return extractPlainTextFromObject(parsed);
        } catch {
            // Not JSON, return as-is
            return content;
        }
    }

    // If it's an object, extract text recursively
    return extractPlainTextFromObject(content);
}

/**
 * Recursively extract text from TipTap JSON structure
 */
function extractPlainTextFromObject(obj: unknown): string {
    if (typeof obj === "string") {
        return obj;
    }

    if (!obj || typeof obj !== "object") {
        return "";
    }

    const node = obj as Record<string, unknown>;

    // If this node has text content, return it
    if (node.text && typeof node.text === "string") {
        return node.text;
    }

    // If this node has content array, process each item
    if (Array.isArray(node.content)) {
        const texts = node.content.map((item) => extractPlainTextFromObject(item));
        // Join with spaces, but preserve paragraph breaks
        let result = texts.filter((t) => t).join(" ");
        // Add line breaks for block elements
        if (node.type === "paragraph" || node.type === "heading") {
            result = result + "\n";
        }
        return result;
    }

    return "";
}

/**
 * Escape HTML special characters so content can be safely used in v-html
 */
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Pre-extracted plain text for a result (avoids re-parsing TipTap JSON in sort/highlight).
 */
type PlainTextCache = {
    text: string;
    summary: string;
};

/**
 * Extract and highlight matching terms from search results
 * @param result - The search result from MiniSearch
 * @param query - The original search query
 * @param maxLength - Maximum length of the highlighted snippet (default: 150)
 * @param plainText - Optional pre-extracted text/summary to avoid re-parsing
 * @returns HTML string with matched terms highlighted, or undefined if no text field
 */
function createHighlight(
    result: SearchResult,
    query: string,
    maxLength: number = 150,
    plainText?: PlainTextCache,
): string | undefined {
    const text = plainText?.text ?? (result.text ? extractPlainText(result.text) : "");
    if (!text) {
        return undefined;
    }

    // Get matched terms from MiniSearch result - ensure it's an object
    const match = result.match;
    if (!match || typeof match !== "object" || Object.keys(match).length === 0) {
        return undefined;
    }

    // Get the original query terms exactly once and cache them
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);

    if (queryTerms.length === 0) {
        return undefined;
    }

    const summaryText =
        plainText?.summary ?? (result.summary ? extractPlainText(result.summary) : "");

    // Determine which field to excerpt from (prefer matched field over others)
    let searchText = text;
    const matchHasText =
        "text" in match && (Array.isArray(match.text) ? match.text.length > 0 : match.text);
    const matchHasSummary =
        "summary" in match &&
        (Array.isArray(match.summary) ? match.summary.length > 0 : match.summary);
    if (matchHasText) {
        searchText = text;
    } else if (matchHasSummary && summaryText) {
        searchText = summaryText;
    } else if ("author" in match && result.author) {
        searchText = String(result.author);
    }

    // Find the earliest occurrence of any query term in the search text
    let bestPosition = -1;
    for (const term of queryTerms) {
        const position = searchText.toLowerCase().indexOf(term.toLowerCase());
        if (position !== -1 && (bestPosition === -1 || position < bestPosition)) {
            bestPosition = position;
        }
    }

    // Fallback: try title if no match found in primary text
    if (bestPosition === -1 && "title" in match && result.title) {
        const titleText = String(result.title).toLowerCase();
        const termPos = titleText.indexOf(queryTerms[0]);
        if (termPos !== -1) {
            bestPosition = 0;
            searchText = String(result.title);
        }
    }

    // Fallback: try author if no match found in text/summary/title
    if (bestPosition === -1 && "author" in match && result.author) {
        const authorText = String(result.author).toLowerCase();
        const termPos = authorText.indexOf(queryTerms[0]);
        if (termPos !== -1) {
            bestPosition = 0;
            searchText = String(result.author);
        }
    }

    // Last resort: use the beginning of text
    if (bestPosition === -1) {
        bestPosition = 0;
    }

    // Calculate the excerpt window around the match
    const contextBefore = Math.floor(maxLength / 3);
    const start = Math.max(0, bestPosition - contextBefore);
    let excerpt = searchText.substring(start, start + maxLength);

    // Add ellipsis markers
    if (start > 0) {
        excerpt = "..." + excerpt;
    }

    // Check if there's more content after our excerpt
    if (start + maxLength < searchText.length) {
        excerpt = excerpt + "...";
    }

    // Identify which terms appear in the excerpt for highlighting
    const excerptLower = excerpt.toLowerCase();
    const termsToHighlight = queryTerms.filter((term) => excerptLower.includes(term));

    if (termsToHighlight.length === 0) {
        return escapeHtml(excerpt); // Safe plain excerpt for v-html
    }

    // Prefer exact phrase match: if the full query appears in the excerpt, highlight it as one continuous span
    const normalizedPhrase = queryTerms.join(" ");
    const phrasePos = excerptLower.indexOf(normalizedPhrase);
    if (phrasePos !== -1) {
        const before = excerpt.substring(0, phrasePos);
        const phrase = excerpt.substring(phrasePos, phrasePos + normalizedPhrase.length);
        const after = excerpt.substring(phrasePos + normalizedPhrase.length);
        return (
            escapeHtml(before) +
            '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0">' +
            escapeHtml(phrase) +
            "</mark>" +
            escapeHtml(after)
        );
    }

    // Otherwise highlight each query term as whole words only (word boundaries avoid "in" inside "missing")
    const pattern = termsToHighlight.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
    let built = "";
    let lastIndex = 0;
    for (const m of excerpt.matchAll(regex)) {
        built +=
            escapeHtml(excerpt.slice(lastIndex, m.index)) +
            '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0">' +
            escapeHtml(m[0]) +
            "</mark>";
        lastIndex = (m.index ?? 0) + m[0].length;
    }
    built += escapeHtml(excerpt.slice(lastIndex));
    return built;
}

/**
 * Validate that a document is suitable for indexing
 */
function isValidDocument(doc: unknown): doc is ContentDto {
    if (!doc || typeof doc !== "object") {
        return false;
    }
    const d = doc as Record<string, unknown>;
    return !!(d._id && d.title);
}

/**
 * Initialize the search index: restore from IndexedDB cache if valid, otherwise build from docs and save.
 */
export async function initializeSearchIndex(): Promise<void> {
    if (miniSearch) {
        return;
    }

    const contentCount = await db.docs.where("type").equals(DocType.Content).count();
    const stored = (await db.getLuminaryInternals(SEARCH_INDEX_KEY)) as
        | StoredSearchIndex
        | undefined;

    if (stored?.indexJson && stored.documentCount === contentCount) {
        try {
            miniSearch = (await MiniSearch.loadJSONAsync(
                stored.indexJson,
                getMiniSearchOptions(),
            )) as MiniSearch<ContentDto>;
            searchIndexSizeRef.value = miniSearch.documentCount;
            return;
        } catch {
            // Fall through to rebuild
        }
    }

    miniSearch = createMiniSearch();
    try {
        let offset = 0;
        let batch: ContentDto[];

        do {
            batch = (await db.docs
                .where("type")
                .equals(DocType.Content)
                .offset(offset)
                .limit(INDEX_LOAD_BATCH_SIZE)
                .toArray()) as ContentDto[];

            if (batch.length > 0) {
                const validDocs = batch.filter(isValidDocument);
                if (validDocs.length > 0) {
                    await miniSearch!.addAllAsync(validDocs, { chunkSize: 50 });
                }
                offset += INDEX_LOAD_BATCH_SIZE;
            }
        } while (batch.length === INDEX_LOAD_BATCH_SIZE);

        searchIndexSizeRef.value = miniSearch!.documentCount;
        await db.setLuminaryInternals(SEARCH_INDEX_KEY, {
            version: 1,
            documentCount: miniSearch!.documentCount,
            indexJson: JSON.stringify(miniSearch),
        } as StoredSearchIndex);
    } catch (error) {
        miniSearch = null;
        searchIndexSizeRef.value = 0;
        console.error("Failed to initialize search index:", error);
        throw error;
    }
}

export function addToSearchIndex(doc: ContentDto): void {
    if (!miniSearch) return;
    if (doc.type !== DocType.Content || !isValidDocument(doc)) return;

    miniSearch.add(doc);
    searchIndexSizeRef.value = miniSearch.documentCount;
    void invalidateSearchIndexCache();
}

export function addAllToSearchIndex(docs: ContentDto[]): void {
    if (!miniSearch || !docs?.length) return;

    const validDocs = docs.filter((d) => d.type === DocType.Content && isValidDocument(d));
    if (validDocs.length > 0) {
        miniSearch.addAll(validDocs);
        searchIndexSizeRef.value = miniSearch.documentCount;
        void invalidateSearchIndexCache();
    }
}

export function removeFromSearchIndex(docId: string): void {
    if (!miniSearch || !docId) return;

    try {
        miniSearch.discard(docId);
        searchIndexSizeRef.value = miniSearch.documentCount;
        void invalidateSearchIndexCache();
    } catch {
        // Document was not in the index
    }
}

export function removeAllFromSearchIndex(docIds: string[]): void {
    if (!miniSearch || !docIds?.length) return;

    for (const docId of docIds) {
        if (docId) {
            try {
                miniSearch.discard(docId);
            } catch {
                // Document was not in the index
            }
        }
    }
    searchIndexSizeRef.value = miniSearch.documentCount;
    void invalidateSearchIndexCache();
}

export function updateSearchIndex(doc: ContentDto): void {
    if (!isValidDocument(doc)) return;
    removeFromSearchIndex(doc._id);
    addToSearchIndex(doc);
}

export function search(query: string, options: LuminarySearchOptions = {}): LuminarySearchResult[] {
    if (!miniSearch) return [];

    const normalizedQuery = query?.trim() ?? "";
    if (!normalizedQuery) return [];

    try {
        const searchOptions: SearchOptions = {};

        if (options.fuzzy !== undefined) {
            searchOptions.fuzzy = options.fuzzy;
        }

        searchOptions.prefix = options.prefix ?? true;

        if (options.boost && Object.keys(options.boost).length > 0) {
            searchOptions.boost = options.boost;
        }

        if (options.combineWith) {
            searchOptions.combineWith = options.combineWith;
        }

        const rawResults = miniSearch.search(normalizedQuery, searchOptions);
        const typesFilter = options.types ?? [DocType.Content];
        const languagesFilter = options.languages;

        const filteredResults = rawResults.filter((result) => {
            if (!result._id || !result.title) return false;
            if (result.type !== undefined && !typesFilter.includes(result.type as DocType))
                return false;
            if (
                languagesFilter &&
                languagesFilter.length > 0 &&
                result.language !== undefined &&
                !languagesFilter.includes(String(result.language))
            ) {
                return false;
            }
            return true;
        });

        const toProcess = filteredResults.slice(0, SEARCH_RESULT_LIMIT);
        const plainTextById = new Map<string, PlainTextCache>();
        for (const r of toProcess) {
            if (r._id) {
                plainTextById.set(r._id, {
                    text: r.text ? extractPlainText(r.text) : "",
                    summary: r.summary ? extractPlainText(r.summary) : "",
                });
            }
        }

        const normalizedPhrase = normalizedQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 0)
            .join(" ");
        if (normalizedPhrase) {
            toProcess.sort((a, b) => {
                const phraseRank = (r: (typeof toProcess)[0]): number => {
                    const titleLower = r.title ? String(r.title).toLowerCase() : "";
                    if (titleLower.includes(normalizedPhrase)) return 0;
                    const cached = r._id ? plainTextById.get(r._id) : undefined;
                    const textPlain = cached?.text ?? "";
                    const summaryPlain = cached?.summary ?? "";
                    const body = (textPlain + " " + summaryPlain).toLowerCase();
                    return body.includes(normalizedPhrase) ? 1 : 2;
                };
                const ra = phraseRank(a);
                const rb = phraseRank(b);
                if (ra !== rb) return ra - rb;
                return (b.score ?? 0) - (a.score ?? 0);
            });
        }

        // Add highlighting (reuses pre-computed plain text)
        const resultsWithHighlights = toProcess.map((result) => {
            const cached = result._id ? plainTextById.get(result._id) : undefined;
            const highlight = createHighlight(
                result,
                normalizedQuery,
                150,
                cached ? { text: cached.text, summary: cached.summary } : undefined,
            );
            return {
                ...result,
                highlight,
            } as LuminarySearchResult;
        });

        return resultsWithHighlights;
    } catch (error) {
        console.error("Search error:", error);
        return [];
    }
}

export function isSearchIndexInitialized(): boolean {
    return miniSearch !== null;
}

export function getSearchIndexSize(): number {
    return miniSearch?.documentCount ?? 0;
}

export function clearSearchIndex(): void {
    miniSearch = null;
    searchIndexSizeRef.value = 0;
    void invalidateSearchIndexCache();
}

export async function rebuildSearchIndex(): Promise<void> {
    clearSearchIndex();
    await initializeSearchIndex();
}
