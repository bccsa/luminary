<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "./components/navigation/TopBar.vue";

const { isAuthenticated } = useAuth0();
</script>

<template>
    <TopBar v-if="isAuthenticated" />

    <main class="mx-auto max-w-7xl px-4">
        <RouterView />
    </main>
</template>
