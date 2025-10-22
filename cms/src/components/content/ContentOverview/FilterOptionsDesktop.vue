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
} from "@heroicons/vue/24/outline";
import { type ContentOverviewQueryOptions } from "../query";
import { type ContentDto, type GroupDto } from "luminary-shared";
import { ref } from "vue";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import { onClickOutside } from "@vueuse/core";
import LTag from "../LTag.vue";
import LDropdown from "@/components/common/LDropdown.vue";

type Props = {
    translationOptions: any[];
    statusOptions: any[];
    tagContentDocs: ContentDto[];
    groups: GroupDto[];
    reset: Function;
};

defineProps<Props>();

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });
// Debouncing the search term so it is the only unique query option that needs a seperate defineModel
const query = defineModel("query", { required: true });

const sortOptionsMenu = ref(undefined);
const showSortOptions = ref(false);

onClickOutside(sortOptionsMenu, () => {
    showSortOptions.value = false;
});
</script>

<template>
    <div
        class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow"
    >
        <div class="flex w-full items-center gap-1 px-8 py-1">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="query as string"
                :full-height="true"
            />

            <div class="relative flex gap-1">
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

                <LButton @click="showSortOptions = !showSortOptions" data-test="sort-toggle-btn">
                    <ArrowsUpDownIcon class="h-full w-4" />
                </LButton>
                <div class="absolute left-[39rem] top-12">
                    <LDropdown
                        ref="sortOptionsMenu"
                        :show="showSortOptions"
                        data-test="sort-options-display"
                        padding="medium"
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
                    </LDropdown>
                </div>
                <LButton @click="reset()" class="w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>

        <!-- Selected Tags and Groups -->
        <div class="flex w-full flex-col gap-1">
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
                        {{ groups.find((g) => g._id == group)?.name }}
                    </LTag>
                </ul>
            </div>
        </div>
    </div>
</template>
