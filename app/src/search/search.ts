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
    /**
     * Filter by publish status. Defaults to published only.
     */
    status?: "published" | "draft" | "all";
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
            "title",
            "author",
            "summary",
            "text",
            "slug",
            "language",
            "status",
            "parentId",
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

    // Get matched terms from MiniSearch result
    const match = result.match as Record<string, string[]> | undefined;
    if (!match) {
        return undefined;
    }

    // Get all matched terms (keys from the match object)
    const matchedTerms = Object.keys(match);
    if (matchedTerms.length === 0) {
        return undefined;
    }

    // Also extract plain text from summary for fallback
    const summaryText = result.summary ? extractPlainText(result.summary) : "";

    // Find the best position to excerpt from the text
    // Priority: text field matches > summary matches > title matches
    let searchText = text;
    if (match.text) {
        // Use the full text if text field matched
        searchText = text;
    } else if (match.summary && summaryText) {
        // Use summary if that matched
        searchText = summaryText;
    }

    // Find the earliest occurrence of any matched term in the search text
    let bestPosition = -1;
    for (const term of matchedTerms) {
        const position = searchText.toLowerCase().indexOf(term.toLowerCase());
        if (position !== -1 && (bestPosition === -1 || position < bestPosition)) {
            bestPosition = position;
        }
    }

    // If no match found in text, try to find in title
    if (bestPosition === -1 && match.title && result.title) {
        bestPosition = (result.title as string)
            .toLowerCase()
            .indexOf(matchedTerms[0].toLowerCase());
        if (bestPosition !== -1) {
            searchText = result.title as string;
        }
    }

    // If still no match, just use the beginning of the text
    if (bestPosition === -1) {
        bestPosition = 0;
        searchText = text;
    }

    // Calculate the excerpt window around the match
    const contextBefore = Math.floor(maxLength / 3);
    const start = Math.max(0, bestPosition - contextBefore);
    let excerpt = searchText.substring(start, start + maxLength);

    // Add ellipsis if we're not at the beginning
    if (start > 0) {
        excerpt = "..." + excerpt;
    }

    // Add ellipsis if we're not at the end
    const actualText = match.text ? text : searchText;
    if (start + maxLength < actualText.length) {
        excerpt = excerpt + "...";
    }

    // Highlight consecutive query terms together, including ALL words between them
    // This handles cases like searching for "Oliver moved" where text has "Oliver quickly moved"

    // Get the original query terms
    const queryTerms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 0);

    // Only highlight terms that actually exist in the excerpt (case-insensitive check)
    const excerptLower = excerpt.toLowerCase();
    const termsToHighlight = queryTerms.filter((term) => {
        return excerptLower.includes(term);
    });

    let highlightedExcerpt = excerpt;

    // If we have 2+ terms, highlight the entire span from first to last term
    if (termsToHighlight.length >= 2) {
        // Find position of first term
        let firstPos = -1;
        let lastPos = -1;

        for (const term of termsToHighlight) {
            const pos = excerptLower.indexOf(term);
            if (pos !== -1) {
                if (firstPos === -1 || pos < firstPos) {
                    firstPos = pos;
                }
                if (pos + term.length > lastPos) {
                    lastPos = pos + term.length;
                }
            }
        }

        if (firstPos !== -1 && lastPos !== -1) {
            // Get the text before, the highlighted span (from first to last term), and the text after
            const beforeSpan = excerpt.substring(0, firstPos);
            const highlightedSpan = excerpt.substring(firstPos, lastPos);
            const afterSpan = excerpt.substring(lastPos);

            // Wrap the entire span (including gap words) in one highlight
            highlightedExcerpt =
                beforeSpan +
                '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">' +
                highlightedSpan +
                "</mark>" +
                afterSpan;
        }
    } else if (termsToHighlight.length === 1) {
        // Single term - highlight it
        const term = termsToHighlight[0];
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escaped})`, "gi");
        highlightedExcerpt = excerpt.replace(
            regex,
            '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>',
        );
    }

    return highlightedExcerpt;
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

    // Get all content documents from IndexedDB
    const docs = await db.docs.where("type").equals(DocType.Content).toArray();

    // Add all documents to the index
    if (docs.length > 0) {
        const contentDocs = docs as ContentDto[];
        miniSearch.addAll(contentDocs);
    }

    console.log(`Search index initialized with ${docs.length} documents`);
}

/**
 * Add a document to the search index
 */
export function addToSearchIndex(doc: ContentDto): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    // Only index content documents
    if (doc.type !== DocType.Content) {
        return;
    }

    miniSearch.add(doc);
}

/**
 * Remove a document from the search index
 */
export function removeFromSearchIndex(docId: string): void {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return;
    }

    miniSearch.discard(docId);
}

/**
 * Update a document in the search index (remove then add)
 */
export function updateSearchIndex(doc: ContentDto): void {
    removeFromSearchIndex(doc._id);
    addToSearchIndex(doc);
}

/**
 * Search the index
 * @param query - Search query string
 * @param options - Search options
 * @returns Array of search results with document
 */
export function search(query: string, options: LuminarySearchOptions = {}): LuminarySearchResult[] {
    if (!miniSearch) {
        console.warn("Search index not initialized. Call initializeSearchIndex first.");
        return [];
    }

    if (!query || !query.trim()) {
        return [];
    }

    try {
        // Default options for MiniSearch
        const searchOptions: SearchOptions = {
            fuzzy: options.fuzzy ?? 0.2,
            prefix: options.prefix ?? true,
        };

        // Only add boost if it's provided and not empty
        if (options.boost && Object.keys(options.boost).length > 0) {
            searchOptions.boost = options.boost;
        }

        // Only add combineWith if it's provided
        if (options.combineWith) {
            searchOptions.combineWith = options.combineWith;
        }

        const results = miniSearch.search(query.trim(), searchOptions);

        // MiniSearch returns stored fields directly on the result object, not in a 'doc' property
        // Filter results after search
        const filteredResults = results.filter((result) => {
            // Check if result has the required fields
            if (!result._id || !result.title) {
                return false;
            }

            return true;
        });

        // Add highlighting to results
        const resultsWithHighlights = filteredResults.map((result) => {
            const highlight = createHighlight(result, query.trim());
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
