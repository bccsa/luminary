<script lang="ts" setup>
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

type Props = {
    padding?: "small" | "medium" | "large" | "none";
};

withDefaults(defineProps<Props>(), {
    padding: "medium",
});

const shouldShowDropdown = defineModel<boolean>("shouldShowDropdown", { required: true });
const dropdownElementRef = ref<HTMLElement | null>(null);

onClickOutside(dropdownElementRef, () => {
    shouldShowDropdown.value = false;
});
</script>

<template>
    <div v-show="shouldShowDropdown" ref="dropdownElementRef" class="z-50">
        <div
            class="w-48 rounded-md border bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            :class="[
                padding === 'small'
                    ? 'p-1'
                    : padding === 'medium'
                      ? 'p-2'
                      : padding === 'large'
                        ? 'p-3'
                        : 'p-0',
            ]"
        >
            <slot />
        </div>
    </div>
</template>
