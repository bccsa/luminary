<script setup lang="ts">
import ProfileMenu from "./ProfileMenu.vue";
</script>

<template>
    <header class="mb-6 bg-white shadow">
        <div
            class="mx-auto flex max-w-7xl flex-row items-center justify-between space-x-8 px-4 py-5"
        >
            <RouterLink to="/">
                <img alt="logo" class="w-52" src="@/assets/logo.svg" />
            </RouterLink>

            <div>
                <ProfileMenu />
            </div>
        </div>
    </header>
</template>
