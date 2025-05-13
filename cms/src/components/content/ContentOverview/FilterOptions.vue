<script setup lang="ts">
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    TagIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
} from "@heroicons/vue/24/outline";
import { LanguageIcon, CloudArrowUpIcon } from "@heroicons/vue/20/solid";
import type { ContentDto, GroupDto } from "luminary-shared";
import { type ContentOverviewQueryOptions } from "../query";
import { ref } from "vue";
import { debouncedWatch, onClickOutside } from "@vueuse/core";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";

type FilterOptionsProps = {
    groups: GroupDto[];
    tagContentDocs: ContentDto[];
};

defineProps<FilterOptionsProps>();

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });

const filterByStatusOptions = [
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

const filterByTranslationOptions = [
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

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});
</script>

<template>
    <div class="flex w-full gap-1 rounded-t-md bg-white p-2 shadow">
        <LInput
            type="text"
            :icon="MagnifyingGlassIcon"
            class="flex-grow"
            name="search"
            placeholder="Search..."
            data-test="search-input"
            v-model="debouncedSearchTerm"
            :full-height="true"
        />

        <div>
            <div class="relative flex gap-1">
                <LSelect
                    data-test="filter-select"
                    v-model="queryOptions.translationStatus"
                    :options="filterByTranslationOptions"
                    :icon="LanguageIcon"
                />
                <LSelect
                    data-test="filter-select"
                    v-model="queryOptions.publishStatus"
                    :options="filterByStatusOptions"
                    :icon="CloudArrowUpIcon"
                />

                <LCombobox
                    :options="
                        tagContentDocs.map((tag) => ({
                            id: tag.parentId,
                            label: tag.title,
                            value: tag.parentId,
                        }))
                    "
                    v-model:selected-options="queryOptions.tags as string[]"
                    :show-selected-in-dropdown="false"
                    :showSelectedLabels="false"
                    :icon="TagIcon"
                />

                <LCombobox
                    :options="
                        groups.map((group: GroupDto) => ({
                            id: group._id,
                            label: group.name,
                            value: group._id,
                        }))
                    "
                    v-model:selected-options="queryOptions.groups as string[]"
                    :show-selected-in-dropdown="false"
                    :showSelectedLabels="false"
                    :icon="UserGroupIcon"
                />

                <LButton @click="() => (showSortOptions = true)" data-test="sort-toggle-btn">
                    <ArrowsUpDownIcon class="h-full w-4" />
                </LButton>
                <Menu
                    as="div"
                    ref="sortOptionsMenu"
                    class="absolute right-0 top-full mt-[2px] h-max w-40 rounded-lg bg-white p-2 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
                    v-if="showSortOptions"
                    data-test="sort-options-display"
                >
                    <div class="flex flex-col">
                        <LRadio
                            label="Title"
                            value="title"
                            v-model="queryOptions.orderBy"
                            data-test="sort-option-title"
                        />
                        <LRadio
                            label="Expiry Date"
                            value="expiryDate"
                            v-model="queryOptions.orderBy"
                            data-test="sort-option-expiry-date"
                        />
                        <LRadio
                            label="Publish Date"
                            value="publishDate"
                            v-model="queryOptions.orderBy"
                            data-test="sort-option-publish-date"
                        />
                        <LRadio
                            label="Last Updated"
                            value="updatedTimeUtc"
                            v-model="queryOptions.orderBy"
                            data-test="sort-option-last-updated"
                        />
                    </div>
                    <hr class="my-2" />
                    <div class="flex flex-col gap-1">
                        <LButton
                            class="flex justify-stretch"
                            data-test="ascending-sort-toggle"
                            :class="
                                queryOptions.orderDirection == 'asc' ? 'bg-zinc-100' : 'bg-white'
                            "
                            :icon="ArrowUpIcon"
                            @click="queryOptions.orderDirection = 'asc'"
                            >Ascending</LButton
                        >
                        <LButton
                            class="flex justify-stretch"
                            data-test="descending-sort-toggle"
                            :class="
                                queryOptions.orderDirection == 'desc' ? 'bg-zinc-100' : 'bg-white'
                            "
                            variant="secondary"
                            :icon="ArrowDownIcon"
                            @click="queryOptions.orderDirection = 'desc'"
                            >Descending</LButton
                        >
                    </div>
                </Menu>
                <LButton @click="resetQueryOptions" class="w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>
    </div>
</template>
