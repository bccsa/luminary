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
            name: "Explorer",
            icon: BookOpenIcon,
            action: () => router.push({ name: "topics" }),
        },
    ];
});
</script>
<template>
    <div>
        <div
            v-for="item in commonNavigation"
            :key="item.name"
            @click="item.action"
            class="flex w-auto cursor-pointer rounded-md px-2 py-1 hover:bg-zinc-300 dark:hover:bg-zinc-600 lg:flex"
        >
            <div class="flex items-center justify-center gap-1">
                <component
                    :is="item.icon"
                    class="h-6 w-6 flex-shrink-0 text-zinc-800 dark:text-white"
                    aria-hidden="true"
                />
                <h1 class="font-bold">{{ item.name }}</h1>
            </div>
        </div>
    </div>
</template>
