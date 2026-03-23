<script setup lang="ts">
import type { GroupDto } from "luminary-shared";
import { PlusIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { nextTick, ref, toRaw, toRefs, watch } from "vue";
import LButton from "../button/LButton.vue";
import LCombobox from "../forms/LCombobox.vue";

type Props = {
    groups: GroupDto[];
};

const props = defineProps<Props>();

const { groups } = toRefs(props);

const emit = defineEmits(["select"]);

const queryOptions = ref({
    groups: [],
});

const isComboboxOpen = ref(false);
const comboboxRef = ref<InstanceType<typeof LCombobox> | null>(null);

const selectGroup = (group: GroupDto) => {
    emit("select", toRaw(group));
    isComboboxOpen.value = false;
    queryOptions.value.groups = [];
};

const handleSelect = (option: { value: string }) => {
    const group = groups.value.find((g) => g._id === option.value);
    if (group) selectGroup(group);
};

watch(isComboboxOpen, (val) => {
    if (!val) return;
    nextTick(() => comboboxRef.value?.open());
});
</script>

<template>
    <div class="h-10">
        <div v-if="!isComboboxOpen">
            <LButton
                class="relative"
                variant="tertiary"
                data-test="addGroupButton"
                :icon="PlusIcon"
                @click="isComboboxOpen = true"
            />
        </div>
        <div v-if="isComboboxOpen" @focusout="isComboboxOpen = false">
            <LCombobox
                ref="comboboxRef"
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
                disable-teleport
                @select="handleSelect"
            />
        </div>
    </div>
</template>
