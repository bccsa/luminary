<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount, watch } from "vue";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";
import * as Sentry from "@sentry/vue";
import { getSocket, isConnected } from "luminary-shared";
import { apiUrl, initLanguage } from "./globalConfig";
import NotificationToastManager from "./components/notifications/NotificationToastManager.vue";
import NotificationBannerManager from "./components/notifications/NotificationBannerManager.vue";
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
        });
    } catch (err) {
        console.error(err);
        Sentry.captureException(err);
    }
});

// Wait 1 second to allow the socket connection to be established before checking the connection status
setTimeout(() => {
    watch(
        isConnected,
        () => {
            if (!isConnected.value) {
                useNotificationStore().addNotification({
                    id: "offlineBanner",
                    title: "You are offline",
                    description:
                        "You can still use the app and browse through offline content, but some content (like videos) might not be available.",
                    state: "warning",
                    type: "banner",
                    icon: SignalSlashIcon,
                });
            }

            if (isConnected.value) {
                useNotificationStore().removeNotification("offlineBanner");
            }
        },
        { immediate: true },
    );
}, 1000);
</script>

<template>
    <TopBar class="sticky top-0 z-40" />
    <NotificationBannerManager />

    <main class="px-6 pt-4">
        <RouterView />
    </main>

    <Teleport to="body">
        <NotificationToastManager />
    </Teleport>
</template>
