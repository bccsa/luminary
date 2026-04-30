<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { DocumentDuplicateIcon } from "@heroicons/vue/24/outline";
import { toRaw, toRefs, ref } from "vue";
import LButton from "../button/LButton.vue";
import LDropdown from "../common/LDropdown.vue";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);
const show = ref(false);

const emit = defineEmits(["select"]);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
    show.value = false;
};
</script>

<template>
    <LDropdown
        class="relative"
        v-model:show="show"
        placement="bottom-end"
        width="default"
        padding="small"
    >
        <template #trigger>
            <LButton
                :icon="DocumentDuplicateIcon"
                class="gap-x-0 !px-0"
                variant="tertiary"
                size="sm"
                title="Duplicate"
                data-test="duplicateAclIcon"
                mainDynamicCss="text-zinc-400"
            />
        </template>

        <div v-if="groups.length > 0">
            <button
                v-for="group in groups"
                :key="group._id"
                role="menuitem"
                class="group flex w-full items-center rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none"
                @click.stop="selectGroup(group)"
                data-test="selectGroupIcon"
            >
                {{ group.name }}
            </button>
        </div>
        <div v-else class="px-2 py-2 text-sm text-zinc-500">All groups added</div>
    </LDropdown>
</template>
