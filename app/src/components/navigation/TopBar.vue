<script setup lang="ts">
import { PlayCircleIcon, ChevronLeftIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
import { useRoute, RouterLink } from "vue-router";
import { useAuth0 } from "@auth0/auth0-vue";
import LButton from "@/components/button/LButton.vue";

const route = useRoute();
const { isAuthenticated } = useAuth0();
</script>

<template>
    <header class="mb-6 bg-white shadow dark:bg-zinc-600">
        <div
            class="mx-auto flex max-w-7xl flex-row items-center justify-between space-x-8 px-4 py-5"
        >
            <RouterLink to="/" class="flex items-center">
                <div
                    class="mr-4 border-r border-zinc-400 pr-4"
                    :class="{
                        hidden: route.name == 'home',
                        'lg:hidden': route.name != 'home',
                    }"
                >
                    <ChevronLeftIcon class="h-6 w-6 text-zinc-600 dark:text-zinc-50" />
                </div>
                <div
                    class="flex items-center gap-2 text-xl hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                    <PlayCircleIcon class="h-8 w-8 text-yellow-500" />
                    <div class="hidden items-center gap-1 min-[340px]:flex">
                        <span class="font-semibold">BCC Africa</span>
                        <span>App</span>
                    </div>
                </div>
            </RouterLink>

            <div v-if="isAuthenticated">
                <ProfileMenu />
            </div>
            <div v-else>
                <LButton
                    variant="primary"
                    size="lg"
                    :is="RouterLink"
                    :to="{ name: 'login' }"
                    rounding="less"
                >
                    Log in
                </LButton>
            </div>
        </div>
    </header>
</template>
