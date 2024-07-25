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
        class="inset-x-0 top-0 z-50 text-zinc-900 shadow-lg"
        :class="bgColor"
    >
        <div class="container mx-auto flex items-center justify-between px-4 py-2">
            <div class="flex items-center gap-2">
                <component :is="icon" class="h-6 w-6" />
                <span>{{ message }}</span>
            </div>
            <XMarkIcon
                @click="isBannerVisible = true"
                class="h-8 w-8 cursor-pointer text-sm underline"
            />
        </div>
    </div>
</template>
