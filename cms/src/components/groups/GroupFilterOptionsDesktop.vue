<script setup lang="ts">
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../content/LTag.vue";
import { type GroupDto } from "luminary-shared";
import { type GroupOverviewQueryOptions } from "./GroupOverview/types.js";
import { MagnifyingGlassIcon, UserGroupIcon, ArrowUturnLeftIcon } from "@heroicons/vue/24/outline";

type Props = {
    groups: GroupDto[];
    reset: Function;
};

defineProps<Props>();

const queryOptions = defineModel<GroupOverviewQueryOptions>("queryOptions", { required: true });
</script>

<template>
    <div
        class="flex flex-col gap-1 overflow-visible pb-1 pt-2"
    >
        <div class="flex w-full items-center gap-1 py-1">
            <LInput
                type="text"
                :icon="MagnifyingGlassIcon"
                class="h-full min-w-0 flex-grow"
                name="search"
                placeholder="Search..."
                data-test="search-input"
                v-model="queryOptions.search"
                :full-height="true"
            />

            <div class="relative flex gap-1">
                <LCombobox
                    :options="
                        groups.map((group: GroupDto) => ({
                            id: group._id,
                            label: group.name,
                            value: group._id,
                        }))
                    "
                    v-model:selected-options="queryOptions.filterGroupIds"
                    :show-selected-in-dropdown="false"
                    :showSelectedLabels="false"
                    :icon="UserGroupIcon"
                />

                <LButton @click="reset()" class="w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>

        <div class="flex w-full flex-col gap-1">
            <div
                v-if="queryOptions.filterGroupIds && queryOptions.filterGroupIds?.length > 0"
                class="w-full"
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
                        {{ groups.find((g) => g._id == group)?.name }}
                    </LTag>
                </ul>
            </div>
        </div>
    </div>
</template>
