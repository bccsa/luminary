<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount } from "vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { getSocket, initSocket } from "@/socket";
import { watchEffectOnceAsync } from "./util/watchEffectOnce";
import { runAfterAuth0IsLoaded } from "./util/runAfterAuth0IsLoaded";

const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
const socketConnectionStore = useSocketConnectionStore();

const socket = getSocket();

// remove any existing listeners (in case of hot reload)
if (socket) socket.off();

const connectToSocket = async () => {
    let token;

    if (isAuthenticated.value) {
        token = await getAccessTokenSilently();
    }

    initSocket(token);

    socketConnectionStore.bindEvents();
};

onBeforeMount(async () => {
    await runAfterAuth0IsLoaded(connectToSocket);
});
</script>

<template>
    <TopBar class="sticky top-0 z-40" />

    <main class="mx-auto max-w-7xl px-4">
        <RouterView />
    </main>
</template>
