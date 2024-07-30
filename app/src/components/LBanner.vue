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
    <div v-if="!isBannerVisible" class="inset-x-0 top-0 z-50 text-zinc-900" :class="bgColor">
        <div class="flex items-center justify-between px-6 py-1 md:px-6 md:py-1">
            <div class="flex items-center gap-2">
                <component :is="icon" class="h-5 w-5" />
                <span class="text-md md:text-sm">{{ message }}</span>
            </div>
            <XMarkIcon
                @click="isBannerVisible = true"
                class="h-6 w-6 cursor-pointer underline md:h-5 md:w-5"
            />
        </div>
    </div>
</template>
