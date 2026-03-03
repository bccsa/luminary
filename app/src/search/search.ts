import MiniSearch, { type SearchOptions, type SearchResult } from "minisearch";
import { DocType, type ContentDto, db } from "luminary-shared";

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
 * Extract and highlight matching terms from search results
 * @param result - The search result from MiniSearch
 * @param query - The original search query
 * @param maxLength - Maximum length of the highlighted snippet (default: 150)
 * @returns HTML string with matched terms highlighted, or undefined if no text field
 */
function createHighlight(
    result: SearchResult,
    query: string,
    maxLength: number = 150,
): string | undefined {
    // Get the text field from the result
    const rawText = result.text;
    if (!rawText) {
        return undefined;
    }

    // Extract plain text from TipTap JSON or use as-is
    const text = extractPlainText(rawText);
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

    // Extract plain text from summary for fallback
    const summaryText = result.summary ? extractPlainText(result.summary) : "";

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

/**
 * Initialize the search index from IndexedDB
 * Call this after the app has synced data from the server
 */
export async function initializeSearchIndex(): Promise<void> {
    if (miniSearch) {
        console.warn("Search index already initialized");
        return;
    }

    miniSearch = createMiniSearch();

    try {
        // Get all content documents from IndexedDB
        const docs = await db.docs.where("type").equals(DocType.Content).toArray();

        if (!docs || docs.length === 0) {
            console.log("Search index initialized with 0 documents");
            return;
        }

        // Filter valid documents and add them
        const validDocs = docs.filter(isValidDocument);
        if (validDocs.length > 0) {
            miniSearch.addAll(validDocs);
        }

        console.log(
            `Search index initialized with ${validDocs.length} of ${docs.length} documents`,
        );
    } catch (error) {
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

    miniSearch.discard(docId);
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
            miniSearch.discard(docId);
        }
    }
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

        // Re-rank: exact phrase matches first (title, then body), then by MiniSearch score
        const normalizedPhrase = normalizedQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((t) => t.length > 0)
            .join(" ");
        if (normalizedPhrase) {
            filteredResults.sort((a, b) => {
                const phraseRank = (r: (typeof filteredResults)[0]): number => {
                    const titleLower = r.title ? String(r.title).toLowerCase() : "";
                    if (titleLower.includes(normalizedPhrase)) return 0;
                    const textPlain = r.text ? extractPlainText(r.text) : "";
                    const summaryPlain = r.summary ? extractPlainText(r.summary) : "";
                    const body = (textPlain + " " + summaryPlain).toLowerCase();
                    return body.includes(normalizedPhrase) ? 1 : 2;
                };
                const ra = phraseRank(a);
                const rb = phraseRank(b);
                if (ra !== rb) return ra - rb;
                return (b.score ?? 0) - (a.score ?? 0);
            });
        }

        // Add highlighting to results
        const resultsWithHighlights = filteredResults
            .map((result) => {
                const highlight = createHighlight(result, normalizedQuery);
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
    if (miniSearch) {
        miniSearch = null;
    }
}

/**
 * Rebuild the search index from scratch
 */
export async function rebuildSearchIndex(): Promise<void> {
    clearSearchIndex();
    await initializeSearchIndex();
}
