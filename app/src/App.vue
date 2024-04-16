<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount } from "vue";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { getSocket, initSocket } from "@/socket";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";

const { isAuthenticated, getAccessTokenSilently, loginWithRedirect } = useAuth0();
const socketConnectionStore = useSocketConnectionStore();

const socket = getSocket();

// remove any existing listeners (in case of hot reload)
if (socket) socket.off();

const connectToSocket = async () => {
    let token;

    if (isAuthenticated.value) {
        try {
            token = await getAccessTokenSilently();
        } catch (e) {
            // If we get an error while getting the token, the refresh token might have expired.
            const error = e as Error;
            console.error(error.message); // TODO add error logging to service

            const usedConnection = localStorage.getItem("usedAuth0Connection");
            await loginWithRedirect({
                authorizationParams: {
                    connection: usedConnection ? usedConnection : undefined,
                    redirect_uri: window.location.origin,
                },
            });
            return;
        }
    }

    initSocket(token);

    socketConnectionStore.bindEvents();
};

onBeforeMount(async () => {
    await waitUntilAuth0IsLoaded(connectToSocket);
});
</script>

<template>
    <TopBar class="sticky top-0 z-40" />

    <main class="mx-auto max-w-7xl px-4">
        <RouterView />
    </main>
</template>
./util/waitUntilAuth0IsLoaded
