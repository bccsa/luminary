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

/**
 * Create and configure the MiniSearch instance
 */
function createMiniSearch(): MiniSearch<ContentDto> {
    return new MiniSearch<ContentDto>({
        // Field that uniquely identifies a document
        idField: "_id",
        // Fields to index for full-text search
        fields: ["title", "author", "summary", "text"],
        // Store fields so we can return them in search results
        storeFields: [
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
        ],
        // Default search options
        searchOptions: {
            // Enable fuzzy search with typo tolerance
            fuzzy: 0.2,
            // Enable prefix search for autocomplete
            prefix: true,
            // Field boosting - title matches are more important
            boost: {
                title: 2,
                summary: 1.5,
                text: 1,
                author: 1,
            },
        },
    });
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
interface PlainTextCache {
    text: string;
    summary: string;
}

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

    const summaryText = plainText?.summary ?? (result.summary ? extractPlainText(result.summary) : "");

    // Determine which field to excerpt from (prefer matched field over others)
    let searchText = text;
    const matchHasText = "text" in match && (Array.isArray(match.text) ? match.text.length > 0 : match.text);
    const matchHasSummary = "summary" in match && (Array.isArray(match.summary) ? match.summary.length > 0 : match.summary);
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
            '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">' +
            escapeHtml(phrase) +
            "</mark>" +
            escapeHtml(after)
        );
    }

    // Otherwise highlight each query term as whole words only (word boundaries avoid "in" inside "missing")
    const pattern = termsToHighlight
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
    const regex = new RegExp(`\\b(${pattern})\\b`, "gi");
    let built = "";
    let lastIndex = 0;
    for (const m of excerpt.matchAll(regex)) {
        built +=
            escapeHtml(excerpt.slice(lastIndex, m.index)) +
            '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">' +
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

const INDEX_LOAD_BATCH_SIZE = 100;

/** Max results to re-rank and highlight; avoids O(n log n) work on huge result sets. */
const SEARCH_RESULT_LIMIT = 20;

/** Common words to ignore when requiring a "meaningful" match (e.g. "who is jesus" → require "jesus" in doc). */
const STOPWORDS = new Set(
    "a an and are be but by for had has have he her his i in is it of on or that the they this to was were what who will with".split(
        " ",
    ),
);

function getSignificantTerms(normalizedQuery: string): string[] {
    const tokens = normalizedQuery
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);
    return tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function documentContainsTerm(
    result: SearchResult,
    term: string,
    plainTextCache: Map<string, PlainTextCache>,
): boolean {
    const titleLower = result.title ? String(result.title).toLowerCase() : "";
    if (titleLower.includes(term)) return true;
    const cached = result._id ? plainTextCache.get(result._id) : undefined;
    const textPlain = cached?.text ?? (result.text ? extractPlainText(result.text) : "");
    const summaryPlain = cached?.summary ?? (result.summary ? extractPlainText(result.summary) : "");
    const body = (textPlain + " " + summaryPlain).toLowerCase();
    return body.includes(term);
}

/**
 * Initialize the search index from IndexedDB
 * Loads content in batches to avoid holding all documents in memory at once.
 * Call this after the app has synced data from the server.
 */
export async function initializeSearchIndex(): Promise<void> {
    if (miniSearch) {
        console.warn("Search index already initialized");
        return;
    }

    miniSearch = createMiniSearch();

    try {
        let totalIndexed = 0;
        let offset = 0;

        // Load content in batches from IndexedDB so we never hold all docs in memory
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
                    await miniSearch.addAllAsync(validDocs, { chunkSize: 50 });
                    totalIndexed += validDocs.length;
                }
                offset += INDEX_LOAD_BATCH_SIZE;
            }
        } while (batch.length === INDEX_LOAD_BATCH_SIZE);

        searchIndexSizeRef.value = miniSearch.documentCount;
        console.log(`Search index initialized with ${totalIndexed} documents`);
    } catch (error) {
        // Reset so the next call can attempt a fresh initialization
        miniSearch = null;
        searchIndexSizeRef.value = 0;
        console.error("Failed to initialize search index:", error);
        throw error;
    }
}

/**
 * Add a document to the search index
 */
export function addToSearchIndex(doc: ContentDto): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    // Only index content documents with required fields
    if (doc.type !== DocType.Content || !isValidDocument(doc)) {
        return;
    }

    miniSearch.add(doc);
    searchIndexSizeRef.value = miniSearch.documentCount;
}

/**
 * Add multiple documents to the search index
 * More efficient than calling addToSearchIndex multiple times
 */
export function addAllToSearchIndex(docs: ContentDto[]): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    if (!docs || docs.length === 0) {
        return;
    }

    const validDocs = docs.filter((doc) => doc.type === DocType.Content && isValidDocument(doc));
    if (validDocs.length > 0) {
        miniSearch.addAll(validDocs);
        searchIndexSizeRef.value = miniSearch.documentCount;
    }
}

/**
 * Remove a document from the search index
 */
export function removeFromSearchIndex(docId: string): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    if (!docId) {
        return;
    }

    try {
        miniSearch.discard(docId);
        searchIndexSizeRef.value = miniSearch.documentCount;
    } catch {
        // Document was not in the index (e.g. non-Content doc deleted after a rebuild)
    }
}

/**
 * Remove multiple documents from the search index
 * More efficient than calling removeFromSearchIndex multiple times
 */
export function removeAllFromSearchIndex(docIds: string[]): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    if (!docIds || docIds.length === 0) {
        return;
    }

    for (const docId of docIds) {
        if (docId) {
            try {
                miniSearch.discard(docId);
            } catch {
                // Document was not in the index (e.g. non-Content doc deleted after a rebuild)
            }
        }
    }
    searchIndexSizeRef.value = miniSearch.documentCount;
}

/**
 * Update a document in the search index (remove then add)
 */
export function updateSearchIndex(doc: ContentDto): void {
    if (!isValidDocument(doc)) {
        return;
    }

    removeFromSearchIndex(doc._id);
    addToSearchIndex(doc);
}

/**
 * Search the index
 * @param query - Search query string
 * @param options - Search options
 * @returns Array of search results with document
 */
export function search(
    query: string,
    options: LuminarySearchOptions = {},
): LuminarySearchResult[] {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return [];
    }

    // Normalize and validate query
    const normalizedQuery = query ? query.trim() : "";
    if (!normalizedQuery) {
        return [];
    }

    try {
        // Build search options, only including provided values
        const searchOptions: SearchOptions = {};

        if (options.fuzzy !== undefined) {
            searchOptions.fuzzy = options.fuzzy;
        }

        if (options.prefix !== undefined) {
            searchOptions.prefix = options.prefix;
        } else {
            searchOptions.prefix = true; // Default to true
        }

        if (options.boost && Object.keys(options.boost).length > 0) {
            searchOptions.boost = options.boost;
        }

        if (options.combineWith) {
            searchOptions.combineWith = options.combineWith;
        }

        // Perform the search
        const rawResults = miniSearch.search(normalizedQuery, searchOptions);

        // Apply Luminary filters (types, languages). Docs from API are already filtered by status.
        const typesFilter = options.types ?? [DocType.Content];
        const languagesFilter = options.languages;

        const filteredResults = rawResults.filter((result) => {
            if (!result._id || !result.title) return false;
            if (result.type !== undefined && !typesFilter.includes(result.type as DocType)) return false;
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

        // Require at least one significant (non-stopword) term in the doc so we don't surface e.g. Copyright/Privacy for "Who is jesus?"
        const significantTerms = getSignificantTerms(normalizedQuery);
        const relevanceFiltered =
            significantTerms.length > 0
                ? filteredResults.filter((result) =>
                      significantTerms.some((term) =>
                          documentContainsTerm(result, term, new Map()),
                      ),
                  )
                : filteredResults;

        // Cap before expensive re-rank + highlight (UI only shows top N anyway)
        const toProcess = relevanceFiltered.slice(0, SEARCH_RESULT_LIMIT);

        // Pre-compute plain text once per result (avoids O(n log n) extractPlainText in sort)
        const plainTextById = new Map<string, PlainTextCache>();
        for (const r of toProcess) {
            if (r._id) {
                plainTextById.set(r._id, {
                    text: r.text ? extractPlainText(r.text) : "",
                    summary: r.summary ? extractPlainText(r.summary) : "",
                });
            }
        }

        // Re-rank: exact phrase matches first (title, then body), then by MiniSearch score
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

/**
 * Check if the search index is initialized
 */
export function isSearchIndexInitialized(): boolean {
    return miniSearch !== null;
}

/**
 * Get the number of documents in the search index
 */
export function getSearchIndexSize(): number {
    if (!miniSearch) {
        return 0;
    }
    return miniSearch.documentCount;
}

/**
 * Clear the search index
 */
export function clearSearchIndex(): void {
    miniSearch = null;
    searchIndexSizeRef.value = 0;
}

/**
 * Rebuild the search index from scratch
 */
export async function rebuildSearchIndex(): Promise<void> {
    clearSearchIndex();
    await initializeSearchIndex();
}
