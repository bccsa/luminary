<!-- <template>
    <div class="flex w-full items-center justify-center py-6">
        <div class="relative h-3 w-full overflow-hidden rounded-full bg-zinc-200 shadow-inner">
           
            <div class="absolute left-0 top-0 h-full rounded-full bg-zinc-500 transition-all duration-500 ease-out"
                :style="{ width: progress + '%' }"></div>

           
            <div v-if="progress < 100"
                class="absolute top-0 left-0 h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent">
            </div>
        </div>

        <span class="ml-3 text-sm font-medium text-zinc-300">{{ Math.floor(progress) }}%</span>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";

const progress = ref(0);

// simulate loading progress
onMounted(() => {
    const interval = setInterval(() => {
        if (progress.value < 100) {
            progress.value += Math.random() * 10;
        } else {
            progress.value = 100;
            clearInterval(interval);
        }
    }, 400);
});
</script>

<style scoped>
@keyframes shimmer {
    0% {
        transform: translateX(-100%);
    }

    100% {
        transform: translateX(100%);
    }
}

.animate-shimmer {
    animation: shimmer 1.5s infinite linear;
}
</style> -->

<template>
    <div class="relative h-3 w-1/2 overflow-hidden rounded-full bg-zinc-200">
        <div class="absolute left-0 top-0 h-full animate-loading-bar bg-zinc-500">

        </div>
    </div>
</template>
