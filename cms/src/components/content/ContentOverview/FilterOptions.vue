<script setup lang="ts">
import type { ContentDto, GroupDto } from "luminary-shared";
import { type ContentOverviewQueryOptions } from "./types";
import { ref, watch } from "vue";
import FilterOptionsMobile from "./FilterOptionsMobile.vue";
import FilterOptionsDesktop from "./FilterOptionsDesktop.vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";

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
const showSearchButton = ref(false);
const showResetButton = ref(false);

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
    showSearchButton.value = false;
};

watch(
    () => searchTerm.value,
    (newVal) => {
        if (!newVal || newVal.length === 0) {
            resetQueryOptions();
            showResetButton.value = false;
            return;
        }
        if (newVal.length >= 3) {
            showSearchButton.value = true;
            showResetButton.value = true;
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
        :search="search"
        rightButtonText="search"
        :rightButtonDisabled="!showSearchButton"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        v-if="isSmallScreen"
    >
        <template #searchButton>
            <div class="flex gap-2">
                <button v-if="showResetButton" @click="resetQueryOptions">
                    <XMarkIcon class="h-6 w-6 cursor-pointer text-zinc-500" />
                </button>
            </div>
        </template>
    </FilterOptionsMobile>
    <FilterOptionsDesktop
        :groups="groups"
        v-model:query="searchTerm"
        v-model:query-options="queryOptions"
        :reset="resetQueryOptions"
        :search="search"
        rightButtonText="search"
        :rightButtonDisabled="!showSearchButton"
        :status-options="statusOptions"
        :translation-options="translationOptions"
        :tag-content-docs="tagContentDocs"
        @keydown.enter="search"
        @keydown.esc="resetQueryOptions"
        v-else
    >
        <template #searchButton>
            <div class="flex gap-2 pr-1">
                <button v-if="showResetButton" @click="resetQueryOptions">
                    <XMarkIcon class="h-6 w-6 cursor-pointer text-zinc-500" />
                </button>
            </div>
        </template>
    </FilterOptionsDesktop>
</template>
