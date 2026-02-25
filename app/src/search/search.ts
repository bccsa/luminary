import MiniSearch, { type SearchOptions, type SearchResult } from "minisearch";
import { DocType, type ContentDto, db } from "luminary-shared";

export interface LuminarySearchResult extends SearchResult {
    doc: ContentDto;
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

            // Skip if no status filtering requested
            if (!options.status || options.status === "all") {
                return true;
            }

            // Filter by publish status
            if (options.status === "published") {
                if (result.status !== "published") {
                    return false;
                }
            }
            if (options.status === "draft") {
                if (result.status !== "draft") {
                    return false;
                }
            }

            return true;
        });

        return filteredResults as LuminarySearchResult[];
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
