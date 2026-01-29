<script setup lang="ts">
import { MagnifyingGlassIcon, ArrowUturnLeftIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { type UserOverviewQueryOptions } from "./UserFilterOptions.vue";
import { type GroupDto } from "luminary-shared";
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../content/LTag.vue";

type Props = {
    groups: GroupDto[];
    reset: Function;
};

defineProps<Props>();

const queryOptions = defineModel<UserOverviewQueryOptions>("queryOptions", { required: true });
const query = defineModel("query", { required: true });
</script>

<template>
    <div
        class="flex flex-col gap-1 overflow-visible border-b border-t border-zinc-300 border-t-zinc-100 bg-white pb-1 pt-2 shadow-md"
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

                <LButton @click="reset()" class="w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>

        <!-- Selected Groups -->
        <div class="flex w-full flex-col gap-1">
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
