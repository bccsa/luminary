<script setup lang="ts">
import { ref } from "vue";
import {
    ArrowUpIcon,
    ArrowDownIcon,
    MagnifyingGlassIcon,
    TagIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
    AdjustmentsVerticalIcon,
    LanguageIcon,
    CloudArrowUpIcon,
} from "@heroicons/vue/24/outline";
import { type ContentOverviewQueryOptions } from "../query";
import type { ContentDto, GroupDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";
import LRadio from "@/components/forms/LRadio.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LSelect from "@/components/forms/LSelect.vue";
import LInput from "@/components/forms/LInput.vue";
import LModal from "@/components/modals/LModal.vue";

type Props = {
    translationOptions: any[];
    statusOptions: any[];
    tagContentDocs: ContentDto[];
    groups: GroupDto[];
    reset: Function;
};

//TODO: Add reset query button

defineProps<Props>();

const queryOptions = defineModel<ContentOverviewQueryOptions>("queryOptions", { required: true });
// Debouncing the search term so it is the only unique query option that needs a seperate defineModel
const query = defineModel("query");

const showMobileQueryOptions = ref(false);
</script>

<template>
    <div class="rounded-md bg-white p-2 shadow">
        <div class="flex gap-1">
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
            <LButton :icon="AdjustmentsVerticalIcon" @click="showMobileQueryOptions = true" />
            <LButton :icon="ArrowUturnLeftIcon" @click="reset()" />
        </div>
    </div>
    <LModal heading="Filter options" v-model:is-visible="showMobileQueryOptions">
        <div class="flex flex-col gap-2">
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
        <div class="mt-3">
            <LSelect
                label="Sort By"
                data-test="filter-select"
                v-model="queryOptions.orderBy"
                :options="[
                    { value: 'title', label: 'Title' },
                    { value: 'publishDate', label: 'Publish Date' },
                    { value: 'expiryDate', label: 'Expiry Date' },
                    { value: 'updatedTimeUtc', label: 'Last Updated' },
                ]"
                :icon="LanguageIcon"
            />

            <div class="mt-3 flex w-full gap-1">
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
