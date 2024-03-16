<script setup lang="ts">
import ProfileMenu from "./ProfileMenu.vue";
</script>

<template>
    <header class="mb-6 bg-white shadow">
        <div
            class="mx-auto flex max-w-7xl flex-col items-center justify-between space-x-8 px-4 py-5 md:flex-row"
        >
            <RouterLink to="/">
                <img alt="logo" class="w-52" src="@/assets/logo.svg" />
            </RouterLink>

            <div>
                <nav class="flex space-x-4 text-gray-800">
                    <RouterLink :to="{ name: 'videos' }" active-class="font-medium">
                        Videos
                    </RouterLink>
                    <div class="text-gray-400">Live</div>
                </nav>
            </div>

            <div>
                <ProfileMenu />
            </div>
        </div>
    </header>
</template>
