<script setup lang="ts">
import { ref, type FunctionalComponent } from "vue";
import { XMarkIcon } from "@heroicons/vue/20/solid";
import { isConnected } from "luminary-shared";

type Props = {
    icon: FunctionalComponent;
    bgColor: string;
    message: string;
};

defineProps<Props>();

const isBannerVisible = ref(isConnected);
</script>

<template>
    <div
        v-if="!isBannerVisible"
        class="shadow-top inset-x-0 top-0 z-50 text-zinc-900"
        :class="bgColor"
    >
        <div class="flex items-center justify-between px-6 py-2 sm:px-6 sm:py-1">
            <div class="flex items-center gap-2">
                <component :is="icon" class="h-5 w-5" />
                <span class="text-lg sm:text-sm">{{ message }}</span>
            </div>
            <XMarkIcon
                @click="isBannerVisible = true"
                class="h-8 w-8 cursor-pointer text-sm underline sm:h-5 sm:w-5"
            />
        </div>
    </div>
</template>

<style scoped>
.shadow-top {
    box-shadow:
        0 -10px 15px -3px rgba(0, 0, 0, 0.1),
        0 -4px 6px -2px rgba(0, 0, 0, 0.05);
}
</style>
