<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount } from "vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { getSocket, initSocket } from "@/socket";

const { getAccessTokenSilently } = useAuth0();
const socketConnectionStore = useSocketConnectionStore();

const socket = getSocket();

// remove any existing listeners (in case of hot reload)
if (socket) socket.off();

onBeforeMount(async () => {
    let token;

    try {
        token = await getAccessTokenSilently();
    } catch (e) {
        // We expect a missing refresh token error when the user is not logged in
        if (e instanceof Error && e.message.indexOf("Missing Refresh Token") > -1) return;
        throw e;
    }

    initSocket(token);

    socketConnectionStore.bindEvents();
});
</script>

<template>
    <TopBar class="sticky top-0 z-40" />

    <main class="mx-auto max-w-7xl px-4">
        <RouterView />
    </main>
</template>
