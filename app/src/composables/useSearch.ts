import { ref, computed, watch } from "vue";
import { type ContentDto, isConnected } from "luminary-shared";
import { appLanguageIdsAsRef } from "@/globalConfig";
import {
    initializeSearchIndex,
    search as doSearch,
    addToSearchIndex,
    addAllToSearchIndex,
    removeFromSearchIndex,
    removeAllFromSearchIndex,
    updateSearchIndex,
    rebuildSearchIndex,
    registerSearchIndexSync,
    searchIndexSizeRef,
    type LuminarySearchResult,
    type LuminarySearchOptions,
} from "../search";

// Singleton state - shared across all components using useSearch()
const globalIsInitialized = ref(false);
const globalIsInitializing = ref(false);
const globalError = ref<string | null>(null);
const globalIsRebuilding = ref(false);

// Track if we've set up the auto-sync watcher
const autoSyncWatcherSetUp = ref(false);

/**
 * Composable for using MiniSearch functionality in Vue components
 * Uses singleton pattern for initialization, but provides local state for queries/results
 */
export function useSearch() {
    const query = ref("");
    const results = ref<LuminarySearchResult[]>([]);

    function requireInitialized(): boolean {
        if (globalIsInitialized.value) return true;
        console.warn("Search index not initialized. Call initialize() first.");
        return false;
    }

    /**
     * Initialize the search index
     * Call this after the app has synced data from the server
     */
    async function initialize(): Promise<void> {
        if (globalIsInitialized.value || globalIsInitializing.value) {
            return;
        }

        globalIsInitializing.value = true;
        globalError.value = null;

        try {
            await initializeSearchIndex();
            globalIsInitialized.value = true;
            console.log(`Search index initialized with ${searchIndexSizeRef.value} documents`);
        } catch (err) {
            console.error("Failed to initialize search index:", err);
            globalError.value =
                err instanceof Error ? err.message : "Failed to initialize search index";
            throw err;
        } finally {
            globalIsInitializing.value = false;
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
        if (!globalIsInitialized.value && !globalIsInitializing.value && searchQuery.trim()) {
            // Initialize asynchronously, but still perform search
            initialize();
        }

        if (!globalIsInitialized.value) {
            return [];
        }

        return doSearch(searchQuery, options);
    }

    /**
     * Perform a search and update local results
     */
    function performSearch(
        searchQuery: string,
        options: LuminarySearchOptions = {},
    ): LuminarySearchResult[] {
        const searchResults = search(searchQuery, options);
        results.value = searchResults;
        return searchResults;
    }

    function addDocument(doc: ContentDto): void {
        if (!requireInitialized()) return;
        addToSearchIndex(doc);
    }

    function addDocuments(docs: ContentDto[]): void {
        if (!requireInitialized() || !docs?.length) return;
        addAllToSearchIndex(docs);
    }

    function removeDocument(docId: string): void {
        if (!requireInitialized()) return;
        removeFromSearchIndex(docId);
    }

    function removeDocuments(docIds: string[]): void {
        if (!requireInitialized() || !docIds?.length) return;
        removeAllFromSearchIndex(docIds);
    }

    function updateDocument(doc: ContentDto): void {
        if (!requireInitialized()) return;
        updateSearchIndex(doc);
    }

    /**
     * Rebuild the search index from scratch
     */
    async function rebuild(): Promise<void> {
        if (globalIsRebuilding.value) return;
        globalIsRebuilding.value = true;
        globalIsInitialized.value = false;
        results.value = [];
        query.value = "";

        try {
            await rebuildSearchIndex();
            globalIsInitialized.value = true;
        } catch (err) {
            console.error("Failed to rebuild search index:", err);
        } finally {
            globalIsRebuilding.value = false;
        }
    }

    /**
     * Set up automatic index updates when data changes in IndexedDB
     * This watches for changes and keeps the search index in sync
     */
    function setupAutoSync(): void {
        if (autoSyncWatcherSetUp.value) return;

        // Watch for connection status - reinitialize when coming back online
        watch(isConnected, async (connected) => {
            if (connected && !globalIsInitialized.value && !globalIsInitializing.value) {
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
                if (globalIsInitialized.value) {
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
        registerSearchIndexSync();
    }

    // Computed properties using global state
    const isInitialized = computed(() => globalIsInitialized.value);
    const isInitializing = computed(() => globalIsInitializing.value);
    const indexSize = computed(() => searchIndexSizeRef.value);
    const error = computed(() => globalError.value);
    const hasResults = computed(() => results.value.length > 0);
    const resultCount = computed(() => results.value.length);

    return {
        // Local state
        query,
        results,
        hasResults,
        resultCount,

        // Global state
        isInitialized,
        isInitializing,
        indexSize,
        error,

        // Methods
        initialize,
        initializeWithAutoSync,
        search,
        performSearch,
        addDocument,
        addDocuments,
        removeDocument,
        removeDocuments,
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
