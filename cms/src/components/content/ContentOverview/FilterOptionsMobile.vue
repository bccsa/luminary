<script setup lang="ts">
import { computed, ref } from "vue";
import {
    MagnifyingGlassIcon,
    TagIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
    AdjustmentsVerticalIcon,
    LanguageIcon,
    CloudArrowUpIcon,
} from "@heroicons/vue/24/outline";
import { type ContentOverviewQueryOptions } from "./types";
import { db, type ContentDto, type GroupDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LInput from "@/components/forms/LInput.vue";
import LModal from "@/components/modals/LModal.vue";
import LTag from "../LTag.vue";
import { groupLabel } from "@/util/groups";

type Props = {
    translationOptions: any[];
    statusOptions: any[];
    tagContentDocs: ContentDto[];
    groups: GroupDto[];
    reset: Function;
    clearSearch: () => void;
    search: () => void;
    trailingPaddingClass?: string;
};

defineProps<Props>();

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });
const query = defineModel("query");

const showSearchIcon = computed(() => !String(query.value ?? "").length);

const showMobileQueryOptions = ref(false);

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
                :full-height="true"
                :trailing-padding-class="trailingPaddingClass"
                @keydown.esc="clearSearch()"
                @keydown.enter="search()"
            >
                <template #searchButton>
                    <slot name="searchButton"></slot>
                </template>
            </LInput>
            <LButton
                class="h-full"
                :icon="AdjustmentsVerticalIcon"
                @click="showMobileQueryOptions = true"
            />
            <LButton class="h-full w-10" :icon="ArrowUturnLeftIcon" @click="reset()" />
        </div>
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
                                if (!queryOptions.tags) return;
                                queryOptions.tags = queryOptions.tags.filter((v) => v != tag);
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
                                if (!queryOptions.groups) return;
                                queryOptions.groups = queryOptions.groups.filter((v) => v != group);
                            }
                        "
                    >
                        {{ groupLabel(group, groups) }}
                    </LTag>
                </ul>
            </div>
        </div>
    </div>
    <LModal
        heading="Filter options"
        :stick-to-edges="true"
        v-model:is-visible="showMobileQueryOptions"
        @keydown.esc="reset()"
        @keydown.enter="search()"
    >
        <div class="flex flex-col gap-2 pb-4">
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
        </div>
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
        <div class="pt-4">
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
        <template #footer>
            <LButton variant="primary" class="mt-2 w-full" @click="showMobileQueryOptions = false"
                >Close</LButton
            >
        </template>
    </LModal>
</template>
