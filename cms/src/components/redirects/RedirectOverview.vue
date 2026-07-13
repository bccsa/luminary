<script setup lang="ts">
import {
    AclPermission,
    DocType,
    hasAnyPermission,
    type RedirectDto,
    useHybridQueryWithState,
    useServerFtsSearch,
} from "luminary-shared";
import BasePage from "../BasePage.vue";
import RedirectDisplaycard from "./RedirectDisplaycard.vue";
import { PlusIcon, XMarkIcon } from "@heroicons/vue/20/solid";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";
import { computed, ref, watch } from "vue";
import LButton from "../button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LoadingBar from "@/components/LoadingBar.vue";
import FtsStaleResultsBanner from "@/components/common/FtsStaleResultsBanner.vue";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
import EmptyState from "@/components/EmptyState.vue";
import { isSmallScreen } from "@/globalConfig";
import {
    useInfiniteScrollList,
    useInfiniteScrollLoadMore,
} from "@/composables/useInfiniteScrollList";

const canCreateNew = computed(() => hasAnyPermission(DocType.Redirect, AclPermission.Edit));
const isCreateOrEditModalVisible = ref(false);

// Trigger-only search: the input only commits to searchTerm on Enter/Go, matching the
// Content and User overviews.
const searchInput = ref("");
const searchTerm = ref("");
const submitSearch = () => {
    if (!searchInput.value) return;
    if (searchInput.value.length >= 3 || searchInput.value.length === 0) {
        searchTerm.value = searchInput.value;
    }
};
const showSearchButton = ref(false);
const showResetButton = ref(false);

const clearSearch = () => {
    searchInput.value = "";
    searchTerm.value = "";
    showSearchButton.value = false;
    showResetButton.value = false;
};

watch(searchInput, (newVal) => {
    if (!newVal || newVal.length === 0) {
        clearSearch();
        return;
    }
    if (newVal.length >= 3) {
        showSearchButton.value = true;
        showResetButton.value = true;
    } else showSearchButton.value = false;
});

/** Minimum characters before switching from synced browse to server-side FTS search. */
const SEARCH_MIN_CHARS = 3;
const searchActive = computed(() => searchTerm.value.trim().length >= SEARCH_MIN_CHARS);

// --- Browse (no / short search): synced HybridQuery + windowed scroll ---
// `isFetching` settles to false when the read completes even with no redirects; a fires-once watch
// on the output would hang on an empty result (HybridQuery dedupes [] → []).
const {
    output: redirects,
    isFetching: browseLoading,
    hasLocalChanges,
} = useHybridQueryWithState<RedirectDto>(
    () => ({
        selector: { type: DocType.Redirect },
        $sort: [{ updatedTimeUtc: "desc" }],
    }),
    { live: true },
);

const { visible: visibleRedirects, sentinel: browseSentinel } = useInfiniteScrollList(redirects, {
    pageSize: 20,
});

// --- Search (≥3 chars): server-side strict FTS over slug + toSlug. Trigger-only: searchTerm
// only changes on Enter/Go (submitSearch above), so re-run explicitly on each change. ---
const search = useServerFtsSearch(searchTerm, {
    docType: DocType.Redirect,
    pageSize: 20,
    debounceMs: "manual",
});
watch(searchTerm, () => search.runSearch(), { immediate: true });
const searchIsLoading = search.isLoading;
const searchIsStale = search.isStale;

const { sentinel: searchSentinel } = useInfiniteScrollLoadMore({
    hasMore: () => searchActive.value && search.hasMore.value,
    isLoading: () => search.isLoading.value,
    onLoadMore: () => search.loadMore(),
});

const displayedRedirects = computed<RedirectDto[]>(() =>
    searchActive.value ? (search.docs.value as RedirectDto[]) : visibleRedirects.value,
);

const hasAnyContent = computed(() => (redirects.value?.length ?? 0) > 0);
</script>

<template>
    <BasePage
        title="Redirects"
        :should-show-page-title="false"
        :is-full-width="true"
        :loading="!searchActive && browseLoading"
    >
        <template #topBarActionsDesktop>
            <LButton
                v-if="canCreateNew && hasAnyContent && !isSmallScreen"
                variant="primary"
                :icon="PlusIcon"
                @click="isCreateOrEditModalVisible = true"
                name="createLanguageBtn"
            >
                Create redirect
            </LButton>
        </template>
        <template #topBarActionsMobile>
            <PlusIcon
                v-if="canCreateNew && hasAnyContent && isSmallScreen"
                class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                @click="isCreateOrEditModalVisible = true"
            />
        </template>

        <template v-if="hasAnyContent" #internalPageHeader>
            <div class="relative z-20 flex flex-col gap-1 overflow-visible">
                <div class="flex h-10 w-full items-center gap-1">
                    <LInput
                        type="text"
                        :icon="MagnifyingGlassIcon"
                        class="h-full min-w-0 flex-grow"
                        name="search"
                        placeholder="Search redirects..."
                        data-test="search-input"
                        v-model="searchInput"
                        :full-height="true"
                        @keydown.enter="submitSearch"
                    >
                        <template #searchButton>
                            <div class="flex items-center gap-1">
                                <button
                                    v-if="showSearchButton"
                                    type="button"
                                    class="rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                                    data-test="search-go-button"
                                    @click="submitSearch"
                                >
                                    Go
                                </button>
                                <button
                                    v-if="showResetButton"
                                    type="button"
                                    aria-label="Clear search"
                                    @click="clearSearch"
                                >
                                    <XMarkIcon class="h-5 w-5 cursor-pointer text-zinc-500" />
                                </button>
                            </div>
                        </template>
                    </LInput>
                </div>
            </div>
        </template>

        <div class="flex flex-col gap-[3px]">
            <FtsStaleResultsBanner
                v-if="searchActive"
                :visible="searchIsStale"
                :loading="searchIsLoading"
                @refresh="search.refresh()"
            />
            <RedirectDisplaycard
                v-for="(redirect, i) in displayedRedirects"
                :key="redirect._id"
                :redirectDoc="redirect"
                :has-local-changes="hasLocalChanges"
                :class="{ 'mb-4': i === displayedRedirects.length - 1 }"
            />

            <!-- Infinite-scroll trigger for the in-memory browse window -->
            <div v-if="!searchActive" ref="browseSentinel" class="h-px w-full"></div>

            <EmptyState
                v-if="!browseLoading && !hasAnyContent"
                title="No redirects yet"
                description="Create a redirect to send visitors from one URL to another."
                :button-text="canCreateNew ? 'Create redirect' : undefined"
                :button-action="
                    canCreateNew ? () => (isCreateOrEditModalVisible = true) : undefined
                "
                :button-permission="canCreateNew"
                show-back-button
            />

            <EmptyState
                v-else-if="searchActive && !searchIsLoading && displayedRedirects.length === 0"
                title="No redirects found"
                description="No redirects match your search criteria."
            />

            <!-- Infinite-scroll trigger for the server-paged search results -->
            <div v-if="searchActive" ref="searchSentinel" class="h-px w-full"></div>

            <div
                v-if="searchActive && searchIsLoading"
                class="flex h-16 w-full items-center justify-center"
            >
                <LoadingBar />
            </div>
        </div>

        <CreateOrEditRedirectModal
            v-if="isCreateOrEditModalVisible"
            :isVisible="isCreateOrEditModalVisible"
            @close="
                isCreateOrEditModalVisible = false;
                if (searchActive) search.markStale();
            "
        />
    </BasePage>
</template>
