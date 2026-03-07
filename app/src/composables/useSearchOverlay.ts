import { ref } from "vue";

// Global state for search overlay
const isSearchOpen = ref(false);

/**
 * Composable to control the global search overlay
 * Can be used by any component to open/close the search
 */
export function useSearchOverlay() {
    const openSearch = () => {
        isSearchOpen.value = true;
    };

    const closeSearch = () => {
        isSearchOpen.value = false;
    };

    const toggleSearch = () => {
        isSearchOpen.value = !isSearchOpen.value;
    };

    return {
        isSearchOpen,
        openSearch,
        closeSearch,
        toggleSearch,
    };
}
