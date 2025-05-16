<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";

import {
    db,
    AclPermission,
    DocType,
    TagType,
    type Uuid,
    hasAnyPermission,
    type ContentDto,
    PostType,
    useDexieLiveQueryWithDeps,
    type GroupDto,
    useDexieLiveQuery,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable from "@/components/content/ContentTable.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";
import { contentOverviewQuery, type ContentOverviewQueryOptions } from "../query";
import { cmsLanguageIdAsRef, isSmallScreen } from "@/globalConfig";
import LTag from "../LTag.vue";
import FilterOptions from "./FilterOptions.vue";
import { TagIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import LPaginator from "@/components/common/LPaginator.vue";

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

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Edit));

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
</script>

<template>
    <BasePage :is-full-width="true" :title="`${capitaliseFirstLetter(tagOrPostType)} overview`">
        <template #actions>
            <div class="flex gap-4">
                <LButton
                    v-if="canCreateNew"
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
            </div>
        </template>

        <div class="scrollbar-hide overflow-y-scroll" style="max-height: calc(100vh - 4rem)">
            <div class="sticky top-0 z-10 bg-white">
                <FilterOptions
                    :is-small-screen="isSmallScreen"
                    :groups="groups"
                    :tagContentDocs="tagContentDocs"
                    v-model:query-options="queryOptions"
                />
            </div>

            <div
                v-if="queryOptions.tags && queryOptions.tags?.length > 0"
                class="w-full bg-white px-2 pb-2 shadow"
            >
                <ul class="flex w-full flex-wrap gap-2">
                    <LTag
                        :icon="TagIcon"
                        v-for="tag in queryOptions.tags"
                        :key="tag"
                        @remove="
                            () => {
                                if (!queryOptions.tags) return;
                                queryOptions.tags = queryOptions.tags.filter((v) => v != tag);
                            }
                        "
                    >
                        {{ tagContentDocs.find((t) => t.parentId == tag)?.title }}
                    </LTag>
                </ul>
            </div>
            <div
                v-if="queryOptions.groups && queryOptions.groups?.length > 0"
                class="w-full bg-white px-2 pb-2 shadow"
            >
                <ul class="flex w-full flex-wrap gap-2">
                    <LTag
                        :icon="UserGroupIcon"
                        v-for="group in queryOptions.groups"
                        :key="group"
                        @remove="
                            () => {
                                if (!queryOptions.groups) return;
                                queryOptions.groups = queryOptions.groups.filter((v) => v != group);
                            }
                        "
                    >
                        {{ groups.find((g) => g._id == group)?.name }}
                    </LTag>
                </ul>
            </div>

            <div class="mt-1">
                <ContentTable
                    :is-small-screen="isSmallScreen"
                    v-if="cmsLanguageIdAsRef"
                    v-model:page-index="queryOptions.pageIndex as number"
                    :key="tableRefreshKey"
                    :groups="groups"
                    :queryOptions="queryOptions"
                    data-test="content-table"
                />
            </div>
        </div>
    </BasePage>
</template>
