<script setup lang="ts">
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../content/LTag.vue";
import LModal from "../modals/LModal.vue";
import { ref } from "vue";
import { type GroupDto } from "luminary-shared";
import { groupLabel } from "@/util/groups";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types.js";
import {
    MagnifyingGlassIcon,
    UserGroupIcon,
    ArrowUturnLeftIcon,
    AdjustmentsVerticalIcon,
} from "@heroicons/vue/24/outline";

type Props = {
    groups: GroupDto[];
    reset: Function;
    search: () => void;
    clearSearch: () => void;
};

defineProps<Props>();

const queryOptions = defineModel<GroupOverviewQueryOptions>("queryOptions", { required: true });

const showMobileQueryOptions = ref(false);

const query = defineModel("query", { required: true });
</script>

<template>
    <div class="z-20 flex flex-col gap-1 overflow-visible">
        <div class="flex h-10 w-full items-center gap-1">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="h-full min-w-0 flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="query as string"
                :full-height="true"
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
            v-if="queryOptions.filterGroupIds && queryOptions.filterGroupIds.length > 0"
            class="flex w-full flex-col gap-1"
        >
            <ul class="flex w-full flex-wrap gap-2">
                <LTag
                    :icon="UserGroupIcon"
                    v-for="group in queryOptions.filterGroupIds"
                    :key="group"
                    @remove="
                        () => {
                            queryOptions.filterGroupIds = queryOptions.filterGroupIds?.filter(
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
    <LModal heading="Filter options" v-model:is-visible="showMobileQueryOptions">
        <div class="flex flex-col gap-2">
            <LCombobox
                :options="
                    groups.map((group: GroupDto) => ({
                        id: group._id,
                        label: group.name,
                        value: group._id,
                    }))
                "
                v-model:selected-options="queryOptions.filterGroupIds"
                :show-selected-in-dropdown="true"
                :showSelectedLabels="true"
                :icon="UserGroupIcon"
            />
        </div>
        <template #footer>
            <LButton variant="primary" class="mt-2 w-full" @click="showMobileQueryOptions = false"
                >Close</LButton
            >
        </template>
    </LModal>
</template>
