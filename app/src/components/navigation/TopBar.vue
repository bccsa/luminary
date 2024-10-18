<script setup lang="ts">
import { PlayCircleIcon, ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, useRouter } from "vue-router";
import DesktopMenu from "./DesktopMenu.vue";

const route = useRoute();
const router = useRouter();
</script>

<template>
    <header>
        <div class="z-40 bg-zinc-100 dark:bg-slate-800">
            <div class="flex flex-row items-center justify-between space-x-8 px-6 py-5">
                <div @click="router.back()" class="flex items-center">
                    <div
                        class="mr-4 border-r border-zinc-400 pr-4"
                        :class="{
                            hidden: route.name == 'home' || route.name == 'explore',
                            'lg:hidden': route.name != 'home',
                        }"
                    >
                        <ChevronLeftIcon class="h-6 w-6 text-zinc-600 dark:text-slate-50" />
                    </div>
                    <div
                        class="flex items-center gap-2 text-xl hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                        <PlayCircleIcon class="h-8 w-8 text-yellow-500" />
                        <div class="hidden items-center gap-1 whitespace-nowrap min-[300px]:flex">
                            <span class="font-semibold">BCC Africa</span>
                            <span>App</span>
                        </div>
                    </div>
                </div>

                <DesktopMenu class="hidden w-2/3 gap-2 lg:flex" />

                <div class="flex items-center gap-4">
                    <ProfileMenu />
                </div>
            </div>
        </div>
    </header>
</template>
