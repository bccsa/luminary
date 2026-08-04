<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useSearchOverlay } from "@/composables/useSearchOverlay";
import SearchPanel from "@/components/search/SearchPanel.vue";

// Desktop search overlay. The search surface itself lives in SearchPanel (shared with the
// dedicated /search page); this wrapper only provides the modal chrome: the backdrop,
// transition, focus-on-open, and the global Cmd+K / Escape shortcuts. Mobile does not open
// this overlay — the bottom-menu search button routes to /search instead.
const { isSearchOpen, closeSearch } = useSearchOverlay();

let handleGlobalKeydown: ((event: KeyboardEvent) => void) | null = null;

onMounted(() => {
    handleGlobalKeydown = (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "k" && !isSearchOpen.value) {
            event.preventDefault();
            isSearchOpen.value = true;
        } else if (event.key === "Escape" && isSearchOpen.value) {
            event.preventDefault();
            closeSearch();
        }
    };
    document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
    if (handleGlobalKeydown) document.removeEventListener("keydown", handleGlobalKeydown);
});
</script>

<template>
    <Transition
        enter-active-class="md:transition-opacity md:duration-200"
        enter-from-class="md:opacity-0"
        enter-to-class="md:opacity-100"
        leave-active-class="md:transition-opacity md:duration-150"
        leave-from-class="md:opacity-100"
        leave-to-class="md:opacity-0"
    >
        <div
            v-show="isSearchOpen"
            class="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col bg-white dark:bg-slate-900 max-lg:bottom-[var(--mobile-menu-h,78px)] md:flex-row md:items-start md:justify-center md:bg-black/60 md:px-4 md:pt-24 md:backdrop-blur-sm md:dark:bg-black/60"
            @click.self="closeSearch"
        >
            <div
                class="flex h-full w-full flex-col overflow-hidden md:h-auto md:max-h-[75vh] md:max-w-3xl md:rounded-xl md:bg-white md:shadow-2xl md:dark:bg-slate-900"
                tabindex="-1"
            >
                <SearchPanel mode="modal" />
            </div>
        </div>
    </Transition>
</template>
