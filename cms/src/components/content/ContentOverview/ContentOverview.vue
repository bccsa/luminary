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
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { contentOverviewQuery, type ContentOverviewQueryOptions } from "../query";
import { cmsLanguageIdAsRef, isSmallScreen } from "@/globalConfig";
import FilterOptions from "./FilterOptions.vue";
import LPaginator from "@/components/common/LPaginator.vue";
import { PlusIcon } from "@heroicons/vue/24/outline";
import { RouterLink } from "vue-router";
import LButton from "@/components/button/LButton.vue";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
};

const props = defineProps<Props>();

const defaultQueryOptions: ContentOverviewQueryOptions = {
    languageId: "",
    parentType: props.docType,
    tagOrPostType: props.tagOrPostType,
    translationStatus: "all",
    orderBy: "updatedTimeUtc",
    orderDirection: "desc",
    pageSize: 20,
    pageIndex: 0,
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

const tableRefreshKey = computed(() => JSON.stringify(queryOptions.value));

router.currentRoute.value.meta.title = `${capitaliseFirstLetter(props.tagOrPostType)} overview`;

const tagContentDocs = useDexieLiveQueryWithDeps(
    cmsLanguageIdAsRef,
    (_cmsLanguageIdAsRef: Uuid) =>
        db.docs
            .where({
                type: DocType.Content,
                parentType: DocType.Tag,
                language: _cmsLanguageIdAsRef,
            })
            .sortBy("title") as unknown as Promise<ContentDto[]>,
    { initialValue: [] as ContentDto[] },
);

const groups = useDexieLiveQuery(
    () => db.docs.where({ type: DocType.Group }).toArray() as unknown as Promise<GroupDto[]>,
    { initialValue: [] as GroupDto[] },
);

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Edit));

const contentDocsTotal = contentOverviewQuery({ ...queryOptions.value, count: true });

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
                    class="h-6 w-6 text-zinc-500"
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
        <div>
            <div class="mt-1">
                <ContentTable
                    v-if="cmsLanguageIdAsRef"
                    v-model:page-index="queryOptions.pageIndex as number"
                    :key="tableRefreshKey"
                    :groups="groups"
                    :queryOptions="queryOptions"
                    :content-docs-total="contentDocsTotal?.count"
                    data-test="content-table"
                />
            </div>
        </div>
        <template #footer>
            <div class="w-full sm:px-8">
                <LPaginator
                    :amountOfDocs="contentDocsTotal?.count as number"
                    v-model:index="queryOptions.pageIndex as number"
                    v-model:page-size="queryOptions.pageSize as number"
                    variant="extended"
                />
            </div>
        </template>
    </BasePage>
</template>
