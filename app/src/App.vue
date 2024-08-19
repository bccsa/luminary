<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount } from "vue";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";
import * as Sentry from "@sentry/vue";
import { getSocket } from "luminary-shared";
import { apiUrl, initLanguage } from "./globalConfig";
import NotificationManager from "./components/notifications/NotificationManager.vue";

const { isAuthenticated, getAccessTokenSilently, loginWithRedirect } = useAuth0();

initLanguage();

const getToken = async () => {
    if (isAuthenticated.value) {
        try {
            return await getAccessTokenSilently();
        } catch (err) {
            Sentry.captureException(err);
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
};

onBeforeMount(async () => {
    await waitUntilAuth0IsLoaded();
    const token = await getToken();

    // Initialize the socket connection
    try {
        getSocket({
            apiUrl,
            token,
        });
    } catch (err) {
        console.error(err);
        Sentry.captureException(err);
    }
});
</script>

<template>
    <TopBar class="sticky top-0 z-40" />

    <main class="px-6">
        <RouterView />
    </main>

    <Teleport to="body">
        <NotificationManager />
    </Teleport>
</template>
