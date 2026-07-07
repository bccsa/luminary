<script setup lang="ts">
import { MagnifyingGlassIcon, ArrowUturnLeftIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { type UserOverviewQueryOptions } from "./UserFilterOptions.vue";
import { type GroupDto } from "luminary-shared";
import LCombobox from "@/components/forms/LCombobox.vue";
import LButton from "@/components/button/LButton.vue";
import LInput from "@/components/forms/LInput.vue";
import LTag from "../content/LTag.vue";
import { groupLabel } from "@/util/groups";
import { computed } from "vue";

type Props = {
    groups: GroupDto[];
    reset: Function;
    trailingPaddingClass?: string;
    search: () => void;
};

defineProps<Props>();

const queryOptions = defineModel<UserOverviewQueryOptions>("queryOptions", { required: true });
const query = defineModel("query", { required: true });

const showSearchIcon = computed(() => !String(query.value ?? "").length);
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
                :autocomplete="'false'"
                data-test="search-input"
                v-model="query as string"
                :full-height="true"
                :trailing-padding-class="trailingPaddingClass"
                @keydown.enter="search"
            >
                <template #searchButton>
                    <slot name="searchButton"></slot>
                </template>
            </LInput>

            <div class="relative flex h-full items-center gap-1">
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

                <LButton @click="reset()" class="h-full w-10">
                    <ArrowUturnLeftIcon class="h-4 w-4" />
                </LButton>
            </div>
        </div>

        <!-- Selected Groups -->
        <div
            v-if="queryOptions.groups && queryOptions.groups.length > 0"
            class="flex w-full flex-col gap-1"
        >
            <ul class="flex w-full flex-wrap gap-2">
                <LTag
                    :icon="UserGroupIcon"
                    v-for="group in queryOptions.groups"
                    :key="group"
                    @remove="
                        () => {
                            queryOptions.groups = queryOptions.groups?.filter((v) => v != group);
                        }
                    "
                >
                    {{ groupLabel(group, groups) }}
                </LTag>
            </ul>
        </div>
    </div>
</template>
