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
import { PlusIcon } from "@heroicons/vue/20/solid";
import { MagnifyingGlassIcon } from "@heroicons/vue/24/outline";
import { computed, ref } from "vue";
import { debouncedWatch } from "@vueuse/core";
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

// Debounced search term (mirrors the User overview's 500ms search debounce).
const searchInput = ref("");
const searchTerm = ref("");
debouncedWatch(
    searchInput,
    () => {
        searchTerm.value = searchInput.value;
    },
    { debounce: 500 },
);

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

const { visible: visibleRedirects } = useInfiniteScrollList(redirects, { pageSize: 20 });

// --- Search (≥3 chars): server-side strict FTS over slug + toSlug. The search term is already
// debounced above, so the composable's own debounce is disabled. ---
const search = useServerFtsSearch(searchTerm, {
    docType: DocType.Redirect,
    pageSize: 20,
    debounceMs: 0,
});
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
            <div
                class="relative z-20 flex flex-col gap-1 overflow-visible"
            >
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
                    />
                </div>
            </div>
        </template>

        <div class="mt-1 flex flex-col gap-[3px]">
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

            <EmptyState
                v-if="!browseLoading && !hasAnyContent"
                title="No redirects yet"
                description="Create a redirect to send visitors from one URL to another."
                :button-text="canCreateNew ? 'Create redirect' : undefined"
                :button-action="canCreateNew ? () => (isCreateOrEditModalVisible = true) : undefined"
                :button-permission="canCreateNew"
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
