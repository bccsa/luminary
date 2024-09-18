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
    <div class="flex flex-row justify-center gap-4 bg-slate-500 py-3">
        <button
            v-for="item in commonNavigation"
            :key="item.name"
            @click="item.action"
            class="flex cursor-pointer flex-col items-center rounded-md px-2 py-1 hover:bg-zinc-400"
        >
            <component :is="item.icon" class="h-6 w-6" />
            <span class="text-sm font-medium">{{ item.name }}</span>
        </button>
    </div>
</template>
