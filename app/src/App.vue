<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount, watch } from "vue";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";
import * as Sentry from "@sentry/vue";
import { getSocket, isConnected } from "luminary-shared";
import { apiUrl, initLanguage } from "./globalConfig";
import NotificationManager from "./components/notifications/NotificationManager.vue";
import { useNotificationStore } from "./stores/notification";
import { SignalSlashIcon } from "@heroicons/vue/24/solid";

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
            cms: true,
        });
    } catch (err) {
        console.error(err);
        Sentry.captureException(err);
    }
});

watch(
    isConnected,
    () => {
        if (!isConnected.value) {
            useNotificationStore().addNotification({
                title: "You are offline",
                state: "warning",
                type: "banner",
                icon: SignalSlashIcon,
            });
        }
    },
    { immediate: true },
);
</script>

<template>
    <TopBar class="sticky top-0 z-40" />
    <NotificationManager type="banner" class="sticky" />

    <main class="px-6 pt-8">
        <RouterView />
    </main>

    <Teleport to="body">
        <NotificationManager type="toast" />
    </Teleport>
</template>
