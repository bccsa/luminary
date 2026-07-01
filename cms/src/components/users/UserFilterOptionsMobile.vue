<script setup lang="ts">
import { ref } from "vue";
import {
    MagnifyingGlassIcon,
    ArrowUturnLeftIcon,
    UserGroupIcon,
    AdjustmentsVerticalIcon,
} from "@heroicons/vue/24/outline";
import { type UserOverviewQueryOptions } from "./UserFilterOptions.vue";
import type { GroupDto } from "luminary-shared";
import LButton from "@/components/button/LButton.vue";
import LCombobox from "@/components/forms/LCombobox.vue";
import LInput from "@/components/forms/LInput.vue";
import LModal from "@/components/modals/LModal.vue";
import LTag from "../content/LTag.vue";

type Props = {
    groups: GroupDto[];
    reset: Function;
};

defineProps<Props>();

const queryOptions = defineModel<UserOverviewQueryOptions>("queryOptions", { required: true });
const query = defineModel("query");

const showMobileQueryOptions = ref(false);
</script>

<template>
    <div
        class="z-20 flex flex-col gap-1 overflow-visible"
    >
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
            />
            <LButton class="h-full" :icon="AdjustmentsVerticalIcon" @click="showMobileQueryOptions = true" />
            <LButton class="h-full w-10" :icon="ArrowUturnLeftIcon" @click="reset()" />
        </div>
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
                                if (!queryOptions.groups) return;
                                queryOptions.groups = queryOptions.groups.filter((v) => v != group);
                            }
                        "
                    >
                        {{ groups.find((g) => g._id == group)?.name }}
                    </LTag>
                </ul>
        </div>
    </div>
    <LModal heading="Filter options" v-model:is-visible="showMobileQueryOptions">
        <div class="flex flex-col gap-2">
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
        <template #footer>
            <LButton variant="primary" class="mt-2 w-full" @click="showMobileQueryOptions = false"
                >Close</LButton
            >
        </template>
    </LModal>
</template>
