<script setup lang="ts">
import {
    ArrowsUpDownIcon,
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    TagIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
    LanguageIcon,
    CloudArrowUpIcon,
    CalendarDaysIcon,
} from "@heroicons/vue/24/outline";
import { type ContentOverviewQueryOptions } from "./types";
import { db, type ContentDto, type GroupDto } from "luminary-shared";
import { computed, ref } from "vue";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../LTag.vue";
import LDropdown from "@/components/common/LDropdown.vue";
import { groupLabel } from "@/util/groups";

type Props = {
    translationOptions: any[];
    statusOptions: any[];
    tagContentDocs: ContentDto[];
    groups: GroupDto[];
    reset: Function;
    search: () => void;
    trailingPaddingClass?: string;
};

defineProps<Props>();

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });
// The typed-but-not-yet-committed search input — searching is trigger-only, so it only
// reaches queryOptions.search on Enter/Go, hence its own model separate from queryOptions.
const query = defineModel("query", { required: true });

const showSearchIcon = computed(() => !String(query.value ?? "").length);

const showSortOptions = ref(false);
const showDateFilters = ref(false);

/** ISO `datetime-local` string <-> epoch-ms bridge for the four date-range filter fields. */
function dateRangeField(key: "publishedAfter" | "publishedBefore" | "expiresAfter" | "expiresBefore") {
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
</script>

<template>
    <div class="relative z-20 flex flex-col gap-1 overflow-visible">
        <div class="flex h-10 w-full items-center gap-1">
            <LInput
                type="text"
                :icon="showSearchIcon ? MagnifyingGlassIcon : undefined"
                class="h-full min-w-0 flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="query as string"
                :autocomplete="'off'"
                :full-height="true"
                :trailing-padding-class="trailingPaddingClass"
                @keydown.enter="search"
            >
                <template #searchButton>
                    <slot name="searchButton"></slot>
                </template>
            </LInput>

            <div class="relative flex h-full items-center gap-1">
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
                                :class="
                                    queryOptions.orderDirection == 'asc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
                                "
                                :icon="ArrowUpIcon"
                                @click="queryOptions.orderDirection = 'asc'"
                                >Ascending</LButton
                            >
                            <LButton
                                class="flex justify-stretch"
                                data-test="descending-sort-toggle"
                                :class="
                                    queryOptions.orderDirection == 'desc'
                                        ? 'bg-zinc-100'
                                        : 'bg-white'
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

                <LButton @click="reset()" class="h-full w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>

        <!-- Selected Tags and Groups -->
        <div
            v-if="
                (queryOptions.tags && queryOptions.tags.length > 0) ||
                (queryOptions.groups && queryOptions.groups.length > 0)
            "
            class="flex w-full flex-col gap-1"
        >
            <div v-if="queryOptions.tags && queryOptions.tags?.length > 0" class="w-full">
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

            <div v-if="queryOptions.groups && queryOptions.groups?.length > 0" class="w-full">
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
    </div>
</template>
