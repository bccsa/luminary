<script setup lang="ts">
import { db, type ContentDto, type GroupDto } from "luminary-shared";
import { type ContentOverviewQueryOptions } from "./types";
import { computed, ref, watch } from "vue";
import FilterOptions from "@/components/common/FilterOptions.vue";
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    TagIcon,
    UserGroupIcon,
    LanguageIcon,
    CloudArrowUpIcon,
    CalendarDaysIcon,
} from "@heroicons/vue/24/outline";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../LTag.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { groupLabel } from "@/util/groups";

/**
 * Reuses the shared FilterOptions component for just its responsive shell (desktop row / mobile
 * Adjustments-button-and-modal / reset wiring). ContentOverview's filter dimensions (status,
 * translation, tags, sort) and its Enter/Esc-driven min-length search are specific enough that
 * they stay fully custom here, via the shared component's search / extra-filters /
 * extra-filters-mobile / selected-filters slots — the built-in group filter and search model are
 * unused.
 */

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
    { value: "published", label: "Published" },
    { value: "scheduled", label: "Scheduled" },
    { value: "expired", label: "Expired" },
    { value: "draft", label: "Draft" },
    { value: "all", label: "All" },
];

const translationOptions = [
    { value: "translated", label: "Translated" },
    { value: "untranslated", label: "Untranslated" },
    { value: "all", label: "All" },
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

const showSearchIcon = computed(() => !String(searchTerm.value ?? "").length);

const trailingPaddingClass = computed(() => {
    if (showSearchButton.value && showResetButton.value) return "pr-[5.5rem]";
    if (showSearchButton.value) return "pr-14";
    if (showResetButton.value) return "pr-10";
    return "";
});

const clearSearch = () => {
    queryOptions.value.search = "";
    searchTerm.value = "";
    showSearchButton.value = false;
    showResetButton.value = false;
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
    showSearchButton.value = false;
    showResetButton.value = false;
};

const showSortOptions = ref(false);
const showDateFilters = ref(false);

/** ISO `datetime-local` string <-> epoch-ms bridge for the four date-range filter fields. */
function dateRangeField(
    key: "publishedAfter" | "publishedBefore" | "expiresAfter" | "expiresBefore",
) {
    return computed<string | undefined>({
        get: () => {
            const value = queryOptions.value[key];
            return value ? db.toIsoDateTime(value) || undefined : undefined;
        },
        set: (val) => {
            queryOptions.value[key] = val ? db.fromIsoDateTime(val) : undefined;
        },
    });
}

const publishedAfterString = dateRangeField("publishedAfter");
const publishedBeforeString = dateRangeField("publishedBefore");
const expiresAfterString = dateRangeField("expiresAfter");
const expiresBeforeString = dateRangeField("expiresBefore");

watch(
    () => searchTerm.value,
    (newVal) => {
        if (!newVal || newVal.length === 0) {
            clearSearch();
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
    <FilterOptions
        :is-small-screen="isSmallScreen"
        search-placeholder="Search..."
        @reset="resetQueryOptions"
    >
        <template #search>
            <LInput
                type="text"
                :icon="showSearchIcon ? MagnifyingGlassIcon : undefined"
                class="h-full min-w-0 flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="searchTerm as string"
                autocomplete="off"
                :full-height="true"
                :trailing-padding-class="trailingPaddingClass"
                @keydown.enter="search"
                @keydown.esc="clearSearch"
            >
                <template #searchButton>
                    <div class="flex items-center gap-1">
                        <button
                            v-if="showSearchButton"
                            type="button"
                            class="rounded-md bg-white px-2 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50"
                            data-test="search-go-button"
                            @click="search"
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
        </template>

        <template #extra-filters>
            <LSelect
                data-test="filter-select"
                v-model="queryOptions.translationStatus"
                :options="translationOptions"
                :icon="LanguageIcon"
            />
            <LSelect
                data-test="filter-select"
                v-model="queryOptions.publishStatus"
                :options="statusOptions"
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
            <LDropdown
                v-model:show="showSortOptions"
                placement="bottom-end"
                padding="medium"
                data-test="sort-options-display"
                class="h-full"
            >
                <template #trigger>
                    <LButton class="h-full" data-test="sort-toggle-btn">
                        <ArrowsUpDownIcon class="h-full w-4" />
                    </LButton>
                </template>

                <div class="flex flex-col">
                    <LRadio
                        label="Relevance"
                        value="relevance"
                        v-model="queryOptions.orderBy"
                        data-test="sort-option-relevance"
                    />
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
                <!-- Direction is meaningless for relevance (always best-match first). -->
                <template v-if="queryOptions.orderBy !== 'relevance'">
                    <hr class="my-2" />
                    <div class="flex flex-col gap-1">
                        <LButton
                            class="flex justify-stretch"
                            data-test="ascending-sort-toggle"
                            :class="queryOptions.orderDirection == 'asc' ? 'bg-zinc-100' : 'bg-white'"
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
                </template>
            </LDropdown>
            <LDropdown
                v-model:show="showDateFilters"
                placement="bottom-end"
                padding="medium"
                width="auto"
                panel-class="!max-h-96"
                data-test="date-filters-display"
                class="h-full"
            >
                <template #trigger>
                    <LButton class="h-full" data-test="date-filters-toggle-btn">
                        <CalendarDaysIcon class="h-full w-4" />
                    </LButton>
                </template>

                <div class="flex w-64 flex-col gap-3">
                    <div>
                        <p class="mb-1 text-sm font-medium text-zinc-700">Published between</p>
                        <div class="flex flex-col gap-1">
                            <LInput
                                name="publishedAfter"
                                type="datetime-local"
                                label="From"
                                data-test="published-after-input"
                                v-model="publishedAfterString"
                            />
                            <LInput
                                name="publishedBefore"
                                type="datetime-local"
                                label="To"
                                data-test="published-before-input"
                                v-model="publishedBeforeString"
                            />
                        </div>
                    </div>
                    <div>
                        <p class="mb-1 text-sm font-medium text-zinc-700">Expires between</p>
                        <div class="flex flex-col gap-1">
                            <LInput
                                name="expiresAfter"
                                type="datetime-local"
                                label="From"
                                data-test="expires-after-input"
                                v-model="expiresAfterString"
                            />
                            <LInput
                                name="expiresBefore"
                                type="datetime-local"
                                label="To"
                                data-test="expires-before-input"
                                v-model="expiresBeforeString"
                            />
                        </div>
                    </div>
                </div>
            </LDropdown>
        </template>

        <template #extra-filters-mobile>
            <LSelect
                label="Translation Status"
                data-test="filter-select"
                v-model="queryOptions.translationStatus"
                :options="translationOptions"
                :icon="LanguageIcon"
            />
            <LSelect
                label="Publish Status"
                data-test="filter-select"
                v-model="queryOptions.publishStatus"
                :options="statusOptions"
                :icon="CloudArrowUpIcon"
            />
            <LCombobox
                label="Tags"
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
                label="Group Memberships"
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
            <div class="flex flex-col gap-3 py-4">
                <div class="flex flex-col gap-2">
                    <p class="text-sm font-medium text-zinc-700">Published between</p>
                    <LInput
                        name="publishedAfter"
                        type="datetime-local"
                        label="From"
                        data-test="published-after-input"
                        v-model="publishedAfterString"
                    />
                    <LInput
                        name="publishedBefore"
                        type="datetime-local"
                        label="To"
                        data-test="published-before-input"
                        v-model="publishedBeforeString"
                    />
                </div>
                <div class="flex flex-col gap-2">
                    <p class="text-sm font-medium text-zinc-700">Expires between</p>
                    <LInput
                        name="expiresAfter"
                        type="datetime-local"
                        label="From"
                        data-test="expires-after-input"
                        v-model="expiresAfterString"
                    />
                    <LInput
                        name="expiresBefore"
                        type="datetime-local"
                        label="To"
                        data-test="expires-before-input"
                        v-model="expiresBeforeString"
                    />
                </div>
            </div>
            <div class="mt-3">
                <LSelect
                    label="Sort By"
                    data-test="filter-select"
                    v-model="queryOptions.orderBy"
                    :options="[
                        { value: 'relevance', label: 'Relevance' },
                        { value: 'title', label: 'Title' },
                        { value: 'publishDate', label: 'Publish Date' },
                        { value: 'expiryDate', label: 'Expiry Date' },
                        { value: 'updatedTimeUtc', label: 'Last Updated' },
                    ]"
                    :icon="LanguageIcon"
                />
                <!-- Direction is meaningless for relevance (always best-match first). -->
                <div v-if="queryOptions.orderBy !== 'relevance'" class="mt-3 flex w-full gap-1">
                    <LRadio
                        class="w-1/2"
                        label="Ascending"
                        value="asc"
                        v-model="queryOptions.orderDirection"
                        data-test="ascending-sort-toggle"
                    />
                    <LRadio
                        class="w-1/2"
                        label="Descending"
                        value="desc"
                        v-model="queryOptions.orderDirection"
                        data-test="descending-sort-toggle"
                    />
                </div>
            </div>
        </template>

        <template #selected-filters>
            <div
                v-if="
                    (queryOptions.tags && queryOptions.tags.length > 0) ||
                    (queryOptions.groups && queryOptions.groups.length > 0)
                "
                class="flex w-full flex-col gap-1"
            >
                <div v-if="queryOptions.tags && queryOptions.tags.length > 0" class="w-full">
                    <ul class="flex w-full flex-wrap gap-2">
                        <LTag
                            :icon="TagIcon"
                            v-for="tag in queryOptions.tags"
                            :key="tag"
                            @remove="
                                () => {
                                    queryOptions.tags = queryOptions.tags?.filter((v) => v != tag);
                                }
                            "
                        >
                            {{ tagContentDocs.find((t) => t.parentId == tag)?.title }}
                        </LTag>
                    </ul>
                </div>

                <div v-if="queryOptions.groups && queryOptions.groups.length > 0" class="w-full">
                    <ul class="flex w-full flex-wrap gap-2">
                        <LTag
                            :icon="UserGroupIcon"
                            v-for="group in queryOptions.groups"
                            :key="group"
                            @remove="
                                () => {
                                    queryOptions.groups = queryOptions.groups?.filter(
                                        (v) => v != group,
                                    );
                                }
                            "
                        >
                            {{ groupLabel(group, groups) }}
                        </LTag>
                    </ul>
                </div>
            </div>
        </template>
    </FilterOptions>
</template>
