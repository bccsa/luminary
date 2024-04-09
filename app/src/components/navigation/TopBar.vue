<script setup lang="ts">
import { PlayIcon } from "@heroicons/vue/24/solid";
import ProfileMenu from "./ProfileMenu.vue";
</script>

<template>
    <header class="mb-6 bg-white shadow">
        <div
            class="mx-auto flex max-w-7xl flex-row items-center justify-between space-x-8 px-4 py-5"
        >
            <RouterLink to="/">
                <div class="flex items-center gap-2 text-xl hover:text-zinc-600">
                    <PlayIcon class="h-6 w-6 text-yellow-500" />
                    <div><span class="font-semibold">BCC Africa</span> <span>App</span></div>
                </div>
            </RouterLink>

            <div>
                <ProfileMenu />
            </div>
        </div>
    </header>
</template>
