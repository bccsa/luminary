<script setup lang="ts">
import { PlayCircleIcon, ChevronLeftIcon, SignalSlashIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, RouterLink } from "vue-router";
import BarnerComponent from "../BannerComponent.vue";

const route = useRoute();
</script>

<template>
    <header class="mb-6 bg-white shadow dark:bg-zinc-700">
        <div class="flex flex-row items-center justify-between space-x-2 px-6 py-5">
            <RouterLink to="/" class="flex items-center">
                <div
                    class="mr-1 border-r border-zinc-400 pr-2"
                    :class="{
                        hidden: route.name == 'home',
                        'lg:hidden': route.name != 'home',
                    }"
                >
                    <ChevronLeftIcon class="h-6 w-6 text-zinc-600 dark:text-zinc-50" />
                </div>
                <div class="flex items-center text-xl hover:text-zinc-600 dark:hover:text-zinc-200">
                    <PlayCircleIcon class="h-8 w-8 text-yellow-500" />
                    <div class="hidden items-center md:flex">
                        <span class="font-semibold">BCC Africa</span>
                        <span>App</span>
                    </div>
                    <div class="flex items-center gap-1 md:hidden">
                        <span class="font-semibold">BCC Africa</span>
                        <span>App</span>
                    </div>
                </div>
            </RouterLink>

            <div class="flex flex-row items-center gap-4">
                <div class="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
                    <div class="flex items-center">
                        <OnlineIndicator />
                    </div>
                    <div class="flex items-center gap-x-4 lg:gap-x-6">
                        <ProfileMenu />
                    </div>
                </div>
            </div>
        </div>
        <div>
            <BarnerComponent
                :icon="SignalSlashIcon"
                message="You are offline"
                bgColor="bg-yellow-100"
            />
        </div>
    </header>
</template>
