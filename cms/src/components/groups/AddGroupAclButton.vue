<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";
import { ref, toRaw, toRefs } from "vue";
import LButton from "../button/LButton.vue";
import { sortByName } from "@/util/sortByName";
import { isMobileScreen } from "@/globalConfig";
import LDropdown from "@/components/common/LDropdown.vue";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);

const emit = defineEmits(["select"]);

const showGroups = ref(false);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
    showGroups.value = false;
};
</script>

<template>
    <LDropdown v-model:show="showGroups" placement="bottom-start" width="default" padding="none">
        <template #trigger>
            <LButton
                class="relative"
                data-test="addGroupButton"
                :icon="ChevronDownIcon"
                icon-right
                :class="isMobileScreen ? '!px-1 !py-1 text-xs' : ''"
            >
                Add access
            </LButton>
        </template>

        <div class="px-1 py-1">
            <!-- v-slot="{ active }" -->
            <div v-for="group in groups.sort(sortByName)" :key="group._id" data-test="group-items">
                <button
                    :class="[
                        'group flex w-full items-center rounded-md px-2 py-2 text-sm hover:bg-zinc-100',
                    ]"
                    @click="() => selectGroup(group)"
                    data-test="selectGroupButton"
                >
                    {{ group.name }}
                </button>
            </div>
            <div v-if="groups.length == 0">
                <div class="px-2 py-2 text-sm text-zinc-500">All groups added</div>
            </div>
        </div>
    </LDropdown>
</template>
