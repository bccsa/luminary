<script lang="ts" setup>
import { onClickOutside } from "@vueuse/core";
import { ref, watch, nextTick } from "vue";

const props = defineProps<{
    padding?: "small" | "medium" | "large" | "none";
    trigger?: HTMLElement | null;
}>();

const show = defineModel<boolean>("show", { required: true });
const dropdownElementRef = ref<HTMLElement | null>(null);

// Position the dropdown correctly when shown
const positionDropdown = () => {
    if (!dropdownElementRef.value || !props.trigger) return;

    const dropdown = dropdownElementRef.value;
    const parentRect = props.trigger.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();

    dropdown.style.position = "fixed";
    dropdown.style.top = `${parentRect.bottom + 4}px`;
    dropdown.style.left = `${parentRect.left + parentRect.width / 2 - dropdownRect.width / 2}px`;
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
        class="relative right-0 top-full z-[9999] mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
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
