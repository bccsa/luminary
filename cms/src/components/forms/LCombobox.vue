<script setup lang="ts">
import { computed, ref, provide, type Component, type StyleValue } from "vue";
import LModal from "../modals/LModal.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import LBadge, { variants } from "../common/LBadge.vue";
import ComboboxContent from "./ComboboxContent.vue";

export type ComboboxOption = {
    id: string | number;
    label: string;
    value: any;
    isVisible?: boolean;
    isRemovable?: boolean;
};

type Props = {
    label?: string;
    labelIcon?: any;
    disabled?: boolean;
    options: ComboboxOption[];
    showSelectedInDropdown?: boolean;
    selectedLabels?: ComboboxOption[];
    showSelectedLabels?: boolean;
    icon?: Component | Function;
    inputIcon?: Component | Function;
    badgeVariant?: keyof typeof variants;
};

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
    showSelectedInDropdown: true,
    showSelectedLabels: true,
});

const selectedOptions = defineModel<Array<string | number>>("selectedOptions", { required: true });
const showEditModal = defineModel<boolean>("showEditModal", { default: false });

const comboboxParent = ref<HTMLElement>();
provide("comboboxParent", comboboxParent);

const selectedLabels = computed(() => {
    if (props.selectedLabels) return props.selectedLabels;
    return props.options.filter((o) => selectedOptions.value.includes(o.id));
});
</script>

<template>
    <div
        ref="comboboxParent"
        class="relative"
        :class="$attrs['class']"
        :style="$attrs['style'] as StyleValue"
    >
        <div class="flex justify-between">
            <div class="flex items-center gap-1">
                <component
                    :is="props.labelIcon"
                    class="h-5 w-5 text-zinc-400"
                    v-if="props.labelIcon"
                />
                <FormLabel v-if="label">{{ label }}</FormLabel>
            </div>
            <slot name="actions" v-if="$slots.actions" />
        </div>

        <div
            v-if="showSelectedLabels && selectedLabels.length > 0"
            class="mt-1 flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide sm:flex-wrap sm:overflow-visible sm:whitespace-normal"
        >
            <LBadge
                v-for="option in selectedLabels"
                :key="option.id"
                type="default"
                :variant="props.badgeVariant"
            >
                {{ option.label }}
            </LBadge>
        </div>

        <LModal v-if="$slots.actions" :heading="label ?? ''" v-bind:isVisible="showEditModal">
            <ComboboxContent
                :disabled="props.disabled"
                :icon="props.icon"
                :options="props.options"
                :selected-options="selectedOptions"
                :show-selected-in-dropdown="props.showSelectedInDropdown"
                :show-selected-labels="props.showSelectedLabels"
                :selected-labels="selectedLabels"
                :badge-variant="props.badgeVariant"
                @update:selectedOptions="(val) => (selectedOptions = val)"
            />
        </LModal>

        <ComboboxContent
            v-else
            :disabled="props.disabled"
            :icon="props.icon"
            :options="props.options"
            :selected-options="selectedOptions"
            :show-selected-in-dropdown="props.showSelectedInDropdown"
            :show-selected-labels="props.showSelectedLabels"
            :selected-labels="selectedLabels"
            :badge-variant="props.badgeVariant"
            @update:selectedOptions="(val) => (selectedOptions = val)"
        />
    </div>
</template>
