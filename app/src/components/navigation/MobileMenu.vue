<script setup lang="ts">
import { BookOpenIcon, HomeIcon } from "@heroicons/vue/24/solid";

import { computed } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

const commonNavigation = computed(() => {
    return [
        {
            name: "Home",
            icon: HomeIcon,
            action: () => router.push({ name: "home" }),
        },
        {
            name: "Explore",
            icon: BookOpenIcon,
            action: () => router.push({ name: "topics" }),
        },
    ];
});
</script>
<template>
    <div class="flex flex-row justify-center gap-4 bg-zinc-600 py-3 dark:bg-zinc-500">
        <button
            v-for="item in commonNavigation"
            :key="item.name"
            @click="item.action"
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1 text-white hover:bg-zinc-400"
        >
            <component :is="item.icon" class="h-6 w-6" />
            <span class="text-sm font-medium text-white">{{ item.name }}</span>
        </button>
    </div>
</template>
