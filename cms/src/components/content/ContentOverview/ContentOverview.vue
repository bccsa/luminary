<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";

import {
    db,
    DocType,
    TagType,
    type Uuid,
    type ContentDto,
    PostType,
    useDexieLiveQueryWithDeps,
    type GroupDto,
    useDexieLiveQuery,
    hasAnyPermission,
    AclPermission,
    type LanguageDto,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { type ContentOverviewQueryOptions } from "./types";
import { useContentBrowseQuery } from "./useContentBrowseQuery";
import { useContentSearchQuery } from "./useContentSearchQuery";
import { useInfiniteScrollLoadMore } from "@/composables/useInfiniteScrollList";
import { cmsLanguageIdAsRef, isSmallScreen } from "@/globalConfig";
import FilterOptions from "./FilterOptions.vue";
import ContentDisplayCard from "../ContentDisplayCard.vue";
import LoadingBar from "../../LoadingBar.vue";
import { PlusIcon, ExclamationTriangleIcon } from "@heroicons/vue/24/outline";
import { RouterLink } from "vue-router";
import LButton from "@/components/button/LButton.vue";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
};

const props = defineProps<Props>();

const PAGE_SIZE = 20;
/** Minimum characters before switching from browse to FTS search mode. */
const SEARCH_MIN_CHARS = 3;

const defaultQueryOptions: ContentOverviewQueryOptions = {
    languageId: cmsLanguageIdAsRef.value || "",
    parentType: props.docType,
    tagOrPostType: props.tagOrPostType,
    translationStatus: "all",
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    tags: [],
    groups: [],
    search: "",
    publishStatus: "all",
};

const savedQueryOptions = () =>
    sessionStorage.getItem(`queryOptions_${props.docType}_${props.tagOrPostType}`);

function mergeNewFields(saved: string | null): ContentOverviewQueryOptions {
    const parsed = saved ? JSON.parse(saved) : {};
    return {
        ...defaultQueryOptions,
        ...parsed,
        parentType: props.docType,
        tagOrPostType: props.tagOrPostType,
        tags: parsed.tags ?? [],
        groups: parsed.groups ?? [],
    };
}

const queryOptions = ref<ContentOverviewQueryOptions>(
    mergeNewFields(savedQueryOptions()) as ContentOverviewQueryOptions,
);

watch(
    queryOptions,
    () => {
        sessionStorage.setItem(
            `queryOptions_${props.docType}_${props.tagOrPostType}`,
            JSON.stringify(queryOptions.value),
        );
    },
    { deep: true },
);

watch(
    [cmsLanguageIdAsRef],
    () => {
        queryOptions.value.languageId = cmsLanguageIdAsRef.value;
    },
    { immediate: true },
);

router.currentRoute.value.meta.title = `${capitaliseFirstLetter(props.tagOrPostType)} overview`;

// --- Data sources: FTS search when a query is present, HybridQuery browse otherwise ---

const searchActive = computed(
    () => (queryOptions.value.search ?? "").trim().length >= SEARCH_MIN_CHARS,
);

/** Browse window size. Bumped by infinite scroll; reset whenever a browse filter changes. */
const browseLimit = ref(PAGE_SIZE);
watch(
    // Reset the window on any change except the search box (search has its own paging).
    () => JSON.stringify({ ...queryOptions.value, search: "" }),
    () => {
        browseLimit.value = PAGE_SIZE;
    },
);

const browse = useContentBrowseQuery(() => queryOptions.value, browseLimit);
const search = useContentSearchQuery(() => queryOptions.value);

const contentDocs = computed(() => (searchActive.value ? search.docs.value : browse.docs.value));
const isLoading = computed(() =>
    searchActive.value ? search.isLoading.value : browse.isLoading.value,
);
const hasMore = computed(() => (searchActive.value ? search.hasMore.value : browse.hasMore.value));

const onLoadMore = () => {
    if (searchActive.value) {
        search.loadMore();
    } else {
        browseLimit.value += PAGE_SIZE;
    }
};

const { sentinel: loadMoreSentinel } = useInfiniteScrollLoadMore({
    hasMore: () => hasMore.value,
    isLoading: () => isLoading.value,
    onLoadMore,
});

// --- Supporting data for the filter UI and cards ---

const tagContentDocs = useDexieLiveQueryWithDeps(
    cmsLanguageIdAsRef,
    async (_cmsLanguageIdAsRef: Uuid) => {
        const docs = (await db.docs
            .where({
                type: DocType.Content,
                parentType: DocType.Tag,
                language: _cmsLanguageIdAsRef,
            })
            .sortBy("publishDate")) as unknown as ContentDto[];
        return docs.reverse();
    },
    { initialValue: [] as ContentDto[] },
);

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const languages = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Language }).toArray() as unknown as Promise<LanguageDto[]>,
    { initialValue: [] as LanguageDto[] },
);

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Edit));

const createNew = () => {
    router.push({
        name: `edit`,
        params: {
            docType: props.docType,
            tagOrPostType: props.tagOrPostType,
            id: "new",
        },
    });
};
</script>

<template>
    <BasePage
        :is-full-width="true"
        :title="`${capitaliseFirstLetter(props.tagOrPostType)} overview`"
        :should-show-page-title="false"
    >
        <template #pageNav>
            <div>
                <LButton
                    v-if="canCreateNew && !isSmallScreen"
                    variant="primary"
                    :icon="PlusIcon"
                    :is="RouterLink"
                    :to="{
                        name: `edit`,
                        params: {
                            docType: docType,
                            tagOrPostType: tagOrPostType,
                            id: 'new',
                        },
                    }"
                    data-test="create-button"
                >
                    Create {{ docType }}
                </LButton>
                <PlusIcon
                    v-else-if="canCreateNew && isSmallScreen"
                    class="h-8 w-8 cursor-pointer rounded bg-zinc-100 p-1 text-zinc-500 hover:bg-zinc-300 hover:text-zinc-700"
                    @click="createNew"
                />
            </div>
        </template>

        <template #internalPageHeader>
            <FilterOptions
                :is-small-screen="isSmallScreen"
                :groups="groups"
                :tagContentDocs="tagContentDocs"
                v-model:query-options="queryOptions"
            />
        </template>

        <div v-if="cmsLanguageIdAsRef" class="mt-1">
            <div class="mb-1 flex flex-col gap-[3px]">
                <ContentDisplayCard
                    v-for="contentDoc in contentDocs"
                    data-test="content-row"
                    :key="contentDoc._id"
                    :groups="groups.filter((group) => contentDoc.memberOf?.includes(group._id))"
                    :content-doc="contentDoc as ContentDto"
                    :parent-type="queryOptions.parentType"
                    :language-id="queryOptions.languageId"
                    :languages="languages"
                    :search-query="searchActive ? queryOptions.search : undefined"
                />

                <div
                    class="flex h-32 w-full items-center justify-center gap-2"
                    v-if="!isLoading && contentDocs.length === 0"
                >
                    <ExclamationTriangleIcon class="h-6 w-6 text-zinc-500" />
                    <p class="text-sm text-zinc-500">No content found with the matched filter.</p>
                </div>

                <!-- Infinite-scroll trigger -->
                <div ref="loadMoreSentinel" class="h-px w-full"></div>

                <div class="flex h-16 w-full items-center justify-center" v-if="isLoading">
                    <LoadingBar />
                </div>
            </div>
        </div>
    </BasePage>
</template>
