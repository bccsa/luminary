<script setup lang="ts">
import type { ContentDto, GroupDto } from "luminary-shared";
import { type ContentOverviewQueryOptions } from "../query";
import { ref } from "vue";
import { debouncedWatch } from "@vueuse/core";
import FilterOptionsMobile from "./FilterOptionsMobile.vue";
import FilterOptionsDesktop from "./FilterOptionsDesktop.vue";

type FilterOptionsProps = {
    groups: GroupDto[];
    tagContentDocs: ContentDto[];
    isSmallScreen?: boolean;
};

withDefaults(defineProps<FilterOptionsProps>(), {
    isSmallScreen: false,
});

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });

const statusOptions = [
    {
        value: "published",
        label: "Published",
    },
    {
        value: "scheduled",
        label: "Scheduled",
    },
    {
        value: "expired",
        label: "Expired",
    },
    {
        value: "draft",
        label: "Draft",
    },
    {
        value: "all",
        label: "All",
    },
];

const translationOptions = [
    {
        value: "translated",
        label: "Translated",
    },
    {
        value: "untranslated",
        label: "Untranslated",
    },
    {
        value: "all",
        label: "All",
    },
];

const debouncedSearchTerm = ref(queryOptions.value.search);
debouncedWatch(
    debouncedSearchTerm,
    () => {
        queryOptions.value.search = debouncedSearchTerm.value;
    },
    { debounce: 500 },
);

const resetQueryOptions = () => {
    queryOptions.value = {
        languageId: queryOptions.value.languageId,
        parentType: queryOptions.value.parentType,
        tagOrPostType: queryOptions.value.tagOrPostType,
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

    debouncedSearchTerm.value = "";
};
</script>

<template>
    <FilterOptionsMobile
        :groups="groups"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        v-if="isSmallScreen"
    />
    <FilterOptionsDesktop
        :groups="groups"
        v-model:query="debouncedSearchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        v-else
    />
</template>
