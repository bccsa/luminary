<script lang="ts" setup>
import { onClickOutside } from "@vueuse/core";
import { ref, watch, nextTick } from "vue";

defineProps<{ padding?: "small" | "medium" | "large" | "none" }>();

const show = defineModel<boolean>("show", { required: true });
const dropdownElementRef = ref<HTMLElement | null>(null);

// Position the dropdown correctly when shown
const positionDropdown = () => {
    if (!dropdownElementRef.value) return;

    const dropdown = dropdownElementRef.value;
    const parent = dropdown.offsetParent as HTMLElement;

    if (parent) {
        // Get the position of the parent relative to the viewport
        const parentRect = parent.getBoundingClientRect();

        // Position the dropdown at the bottom of the parent
        dropdown.style.position = "fixed";
        dropdown.style.top = `${parentRect.bottom}px`;
        dropdown.style.right = `${window.innerWidth - parentRect.right}px`;
        dropdown.style.left = "auto";
    }
};

watch(show, (newShow) => {
    if (newShow) {
        nextTick(() => {
            positionDropdown();
        });
    }
});

onClickOutside(dropdownElementRef, () => {
    show.value = false;
});
</script>

<template>
    <div
        v-show="show"
        ref="dropdownElementRef"
        class="absolute right-0 top-full z-[9999] mt-1 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
        style="transform: translateZ(0)"
    >
        <div
            class="py-1"
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
