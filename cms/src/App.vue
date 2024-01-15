<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterLink, RouterView } from "vue-router";
import LoadingSpinner from "@/components/LoadingSpinner.vue";

const { isAuthenticated } = useAuth0();
</script>

<template>
    <header class="flex items-center gap-8 p-8">
        <img alt="logo" class="w-64" src="@/assets/logo.svg" />

        <div v-if="isAuthenticated">
            <nav class="flex gap-2">
                <RouterLink to="/" class="underline">Home</RouterLink>
                <RouterLink to="/about" class="underline">About</RouterLink>
            </nav>
        </div>
    </header>

    <main class="px-8">
        <RouterView v-if="isAuthenticated" />
        <div v-else class="flex items-center gap-2 text-gray-600">
            <LoadingSpinner />
            Loading...
        </div>
    </main>
</template>
