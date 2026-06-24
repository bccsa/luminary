<script setup lang="ts">
import type { ContentDto, GroupDto } from "luminary-shared";
import { type ContentOverviewQueryOptions } from "./types";
import { ref, watch } from "vue";
import FilterOptionsMobile from "./FilterOptionsMobile.vue";
import FilterOptionsDesktop from "./FilterOptionsDesktop.vue";
import LButton from "@/components/button/LButton.vue";

type FilterOptionsProps = {
    groups: GroupDto[];
    tagContentDocs: ContentDto[];
    isSmallScreen?: boolean;
    docType: string;
    tagOrPostType: string;
};

const props = withDefaults(defineProps<FilterOptionsProps>(), {
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

const searchTerm = ref(queryOptions.value.search);
const search = () => {
    if (!searchTerm.value) return;
    if (searchTerm.value.length >= 3 || searchTerm.value.length === 0) {
        queryOptions.value.search = searchTerm.value;
    }
};

const resetQueryOptions = () => {
    queryOptions.value = {
        languageId: queryOptions.value.languageId,
        parentType: queryOptions.value.parentType,
        tagOrPostType: queryOptions.value.tagOrPostType,
        translationStatus: "all",
        orderBy: "updatedTimeUtc",
        orderDirection: "desc",
        tags: [],
        groups: [],
        search: "",
        publishStatus: "all",
    };

    searchTerm.value = "";
    const storageKey = `queryOptions_${props.docType}_${props.tagOrPostType}`;
    sessionStorage.removeItem(storageKey);
};
const showSearchButton = ref(false);

watch(
    () => searchTerm.value,
    (newVal) => {
        if (!newVal) return;
        if (newVal.length >= 3) {
            showSearchButton.value = true;
        } else if (newVal.length === 0) {
            resetQueryOptions();
        } else showSearchButton.value = false;
    },
);
</script>

<template>
    <FilterOptionsMobile
        :groups="groups"
        v-model:query="searchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        @keydown.enter="search"
        @keydown.esc="resetQueryOptions"
        v-if="isSmallScreen"
    >
        <template #searchButton>
            <LButton v-if="showSearchButton" variant="primary" size="sm" @click="search">
                Search
            </LButton>
        </template>
    </FilterOptionsMobile>
    <FilterOptionsDesktop
        :groups="groups"
        v-model:query="searchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        @keydown.enter="search"
        @keydown.esc="resetQueryOptions"
        v-else
    >
        <template #searchButton>
            <LButton v-if="showSearchButton" variant="primary" size="sm" @click="search">
                Search
            </LButton>
        </template>
    </FilterOptionsDesktop>
</template>
