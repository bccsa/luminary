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
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/24/solid";
import MobileMenu from "./components/navigation/MobileMenu.vue";

const { isAuthenticated, user, getAccessTokenSilently, loginWithRedirect, logout } = useAuth0();

initLanguage();

const loginRedirect = async () => {
    const usedConnection = localStorage.getItem("usedAuth0Connection");
    const retryCount = parseInt(localStorage.getItem("auth0AuthFailedRetryCount") || "0");

    // Try to login. If this fails (e.g. the user cancels the login), log the user out after the second attempt
    if (retryCount < 2) {
        localStorage.setItem("auth0AuthFailedRetryCount", (retryCount + 1).toString());
        await loginWithRedirect({
            authorizationParams: {
                connection: usedConnection ? usedConnection : undefined,
                redirect_uri: window.location.origin,
            },
        });
        return;
    }

    localStorage.removeItem("auth0AuthFailedRetryCount");
    localStorage.removeItem("usedAuth0Connection");
    await logout({ logoutParams: { returnTo: window.location.origin } });
};

// Clear the auth0AuthFailedRetryCount if the user logs in successfully (if the app is not redirecting to the login page, we assume the user either logged out or the login was successful)
setTimeout(() => {
    localStorage.removeItem("auth0AuthFailedRetryCount");
}, 10000);

const getToken = async () => {
    // add UserId to analytics if the user is auth
    // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
    window._paq && user && user.value && window._paq.push(["setUserId", user.value.email]);
    if (isAuthenticated.value) {
        try {
            return await getAccessTokenSilently();
        } catch (err) {
            Sentry.captureException(err);
            await loginRedirect();
        }
    }
};

onBeforeMount(async () => {
    await waitUntilAuth0IsLoaded();
    const token = await getToken();

    // Initialize the socket connection
    try {
        const socket = getSocket({
            apiUrl,
            token,
            cms: true,
        });

        // handle API authentication failed messages
        socket.on("apiAuthFailed", async () => {
            console.error("API authentication failed, redirecting to login");
            Sentry.captureMessage("API authentication failed, redirecting to login");

            await loginRedirect();
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

setTimeout(() => {
    watch(
        [isConnected, isAuthenticated],
        () => {
            if (isConnected.value && !isAuthenticated.value) {
                useNotificationStore().addNotification({
                    id: "accountBanner",
                    title: "You are missing out!",
                    description: "Click here to create an account or log in.",
                    state: "info",
                    type: "banner",
                    icon: ExclamationCircleIcon,
                    routerLink: { name: "login" },
                });
            }

            if (isConnected.value && isAuthenticated.value) {
                useNotificationStore().removeNotification("accountBanner");
            }
        },
        { immediate: true },
    );
}, 1000);
</script>

<template>
    <div class="fixed flex h-dvh w-full flex-col">
        <TopBar class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50" />
        <NotificationBannerManager />
        <main class="flex-1 overflow-y-scroll px-6 py-4 dark:bg-slate-900">
            <RouterView />
        </main>

        <MobileMenu
            class="w-full border-t-2 border-t-zinc-100/25 dark:border-t-slate-700/50 lg:hidden"
        />
    </div>

    <Teleport to="body">
        <NotificationToastManager />
    </Teleport>
</template>
