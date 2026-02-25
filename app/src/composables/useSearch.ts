import { ref, computed, watch } from "vue";
import { type ContentDto, isConnected } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    initializeSearchIndex,
    search as doSearch,
    addToSearchIndex,
    removeFromSearchIndex,
    updateSearchIndex,
    getSearchIndexSize,
    rebuildSearchIndex,
    type LuminarySearchResult,
    type LuminarySearchOptions,
} from "../search";

// Singleton state - shared across all components using useSearch()
const query = ref("");
const results = ref<LuminarySearchResult[]>([]);
const isInitialized = ref(false);
const isInitializing = ref(false);
const indexSize = ref(0);
const error = ref<string | null>(null);

// Track if we've set up the auto-sync watcher
const autoSyncWatcherSetUp = ref(false);

/**
 * Composable for using MiniSearch functionality in Vue components
 * Uses singleton pattern - all components share the same initialized state
 */
export function useSearch() {
    /**
     * Initialize the search index
     * Call this after the app has synced data from the server
     */
    async function initialize(): Promise<void> {
        if (isInitialized.value || isInitializing.value) {
            return;
        }

        isInitializing.value = true;
        error.value = null;

        try {
            await initializeSearchIndex();
            isInitialized.value = true;
            indexSize.value = getSearchIndexSize();
            console.log(`Search index initialized with ${indexSize.value} documents`);
        } catch (err) {
            console.error("Failed to initialize search index:", err);
            error.value = err instanceof Error ? err.message : "Failed to initialize search index";
        } finally {
            isInitializing.value = false;
        }
    }

    /**
     * Perform a search
     * @param searchQuery - The search query string
     * @param options - Search options
     * @returns Array of search results
     */
    function search(
        searchQuery: string,
        options: LuminarySearchOptions = {},
    ): LuminarySearchResult[] {
        // Auto-initialize if not initialized and we have a query
        if (!isInitialized.value && !isInitializing.value && searchQuery.trim()) {
            // Initialize asynchronously, but still perform search
            initialize();
        }

        if (!isInitialized.value) {
            return [];
        }

        const searchResults = doSearch(searchQuery, options);
        return searchResults;
    }

    /**
     * Add a document to the search index
     */
    function addDocument(doc: ContentDto): void {
        if (!isInitialized.value) {
            console.warn("Search index not initialized. Call initialize() first.");
            return;
        }

        addToSearchIndex(doc);
        indexSize.value = getSearchIndexSize();
    }

    /**
     * Remove a document from the search index
     */
    function removeDocument(docId: string): void {
        if (!isInitialized.value) {
            console.warn("Search index not initialized. Call initialize() first.");
            return;
        }

        removeFromSearchIndex(docId);
        indexSize.value = getSearchIndexSize();
    }

    /**
     * Update a document in the search index
     */
    function updateDocument(doc: ContentDto): void {
        if (!isInitialized.value) {
            console.warn("Search index not initialized. Call initialize() first.");
            return;
        }

        updateSearchIndex(doc);
        indexSize.value = getSearchIndexSize();
    }

    /**
     * Rebuild the search index from scratch
     */
    async function rebuild(): Promise<void> {
        isInitialized.value = false;
        await rebuildSearchIndex();
        isInitialized.value = true;
        indexSize.value = getSearchIndexSize();
    }

    /**
     * Set up automatic index updates when data changes in IndexedDB
     * This watches for changes and keeps the search index in sync
     */
    function setupAutoSync(): void {
        if (autoSyncWatcherSetUp.value) return;

        // Watch for connection status - reinitialize when coming back online
        watch(isConnected, async (connected) => {
            if (connected && !isInitialized.value && !isInitializing.value) {
                // Wait a bit for sync to populate data
                setTimeout(() => {
                    initialize();
                }, 2000);
            }
        });

        // Watch for language changes - rebuild index when languages change
        watch(
            appLanguageIdsAsRef,
            async () => {
                if (isInitialized.value) {
                    await rebuild();
                }
            },
            { deep: true },
        );

        autoSyncWatcherSetUp.value = true;
    }

    /**
     * Initialize with auto-sync enabled
     * Call this during app startup to enable automatic search index management
     */
    async function initializeWithAutoSync(): Promise<void> {
        setupAutoSync();
        await initialize();
    }

    // Computed properties
    const hasResults = computed(() => results.value.length > 0);
    const resultCount = computed(() => results.value.length);

    return {
        // State
        query,
        results,
        isInitialized: computed(() => isInitialized.value),
        isInitializing: computed(() => isInitializing.value),
        indexSize: computed(() => indexSize.value),
        error: computed(() => error.value),
        hasResults,
        resultCount,

        // Methods
        initialize,
        initializeWithAutoSync,
        search,
        addDocument,
        removeDocument,
        updateDocument,
        rebuild,
        setupAutoSync,
    };
}

/**
 * Create a search function with default options
 * Useful for creating multiple search instances with different configurations
 */
export function createSearch(defaultOptions: LuminarySearchOptions = {}) {
    const { search, ...rest } = useSearch();

    const searchWithDefaults = (query: string, options: LuminarySearchOptions = {}) => {
        return search(query, { ...defaultOptions, ...options });
    };

    return {
        ...rest,
        search: searchWithDefaults,
    };
}
