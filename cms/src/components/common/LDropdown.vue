<script lang="ts" setup>
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

defineProps<{ padding?: "small" | "medium" | "large" | "none" }>();

const show = defineModel<boolean>("show", { required: true });
const dropdownElementRef = ref<HTMLElement | null>(null);

onClickOutside(dropdownElementRef, () => {
    show.value = false;
});
</script>

<template>
    <div
        v-show="show"
        ref="dropdownElementRef"
        class="relative right-0 z-[9999] w-56 origin-top-right bg-white ring-1 ring-black ring-opacity-5 focus:outline-none lg:top-full"
        style="transform: translateZ(0)"
    >
        <div class="inset-0 size-full h-max rounded-md bg-white shadow-lg lg:absolute">
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
    </div>
</template>
