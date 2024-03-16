<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import { socket } from "@/socket";
import { useSocketConnectionStore } from "@/stores/socketConnection";

const { isAuthenticated } = useAuth0();
const { appName } = useGlobalConfigStore();
const socketConnectionStore = useSocketConnectionStore();

// remove any existing listeners (in case of hot reload)
socket.off();

socketConnectionStore.bindEvents();
</script>

<template>
    <template v-if="isAuthenticated">
        <TopBar />

        <main class="mx-auto max-w-7xl px-4">
            <RouterView />
        </main>
    </template>

    <div v-else class="absolute flex h-full w-full items-center justify-center">
        <div class="flex flex-col items-center gap-4">
            <img class="w-72" src="@/assets/logo.svg" :alt="appName" />
            <div class="flex items-center gap-2 text-lg"><LoadingSpinner /> Loading...</div>
        </div>
    </div>
</template>
