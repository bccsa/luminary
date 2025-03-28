<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { computed, onErrorCaptured, ref, watch } from "vue";
import { isConnected } from "luminary-shared";
import { showLoginModal, userPreferencesAsRef } from "./globalConfig";
import NotificationToastManager from "./components/notifications/NotificationToastManager.vue";
import NotificationBannerManager from "./components/notifications/NotificationBannerManager.vue";
import { useNotificationStore } from "./stores/notification";
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import MobileMenu from "./components/navigation/MobileMenu.vue";
import * as Sentry from "@sentry/vue";
import { useRouter } from "vue-router";

const router = useRouter();
const { isAuthenticated, user } = useAuth0();
const main = ref<HTMLElement | undefined>(undefined);

// Wait 5 seconds to allow the socket connection to be established before checking the connection status
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
                    priority: 1,
                });
            }
            if (isConnected.value) {
                useNotificationStore().removeNotification("offlineBanner");
            }
        },
        { immediate: true },
    );
}, 5000);

// Wait 5.1 second before checking the authentication status
setTimeout(() => {
    watch(
        [isConnected, isAuthenticated],
        () => {
            if (isConnected.value && !isAuthenticated.value) {
                useNotificationStore().addNotification({
                    id: "accountBanner",
                    title: "You are missing out!",
                    description: "Click here to create an account or log in.",
                    state: "warning",
                    type: "banner",
                    icon: ExclamationCircleIcon,
                    link: () => showLoginModal(),
                });
            }
            if (!isConnected.value || isAuthenticated.value) {
                useNotificationStore().removeNotification("accountBanner");
            }
        },
        { immediate: true },
    );
}, 5100);

// Add userId to analytics if privacy policy has been accepted
const unwatchUserPref = watch(userPreferencesAsRef.value, () => {
    if (userPreferencesAsRef.value.privacyPolicy?.status == "accepted") {
        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        window._paq && user && user.value && window._paq.push(["setUserId", user.value.email]);
    }

    // Stop watcher if the privacy policy is accepted or declined
    if (userPreferencesAsRef.value.privacyPolicy?.status) unwatchUserPref();
});

const routeKey = computed(() => {
    return router.currentRoute.value.fullPath;
});

onErrorCaptured((err) => {
    console.error(err);
    Sentry.captureException(err);
});

// Focus main content when arrow up or down is pressed to keep scrolling working even when focus was shifted to the top bar
document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (main.value) main.value.focus();
    }
});
</script>

<template>
    <div class="absolute bottom-0 left-0 right-0 top-0 flex flex-col">
        <TopBar class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50" />
        <NotificationBannerManager />

        <main
            class="flex-1 overflow-y-scroll px-4 py-4 scrollbar-hide focus:outline-none dark:bg-slate-900"
            tabindex="0"
            ref="main"
        >
            <RouterView v-slot="{ Component }">
                <KeepAlive include="HomePage,ExplorePage">
                    <component :is="Component" :key="routeKey" />
                </KeepAlive>
            </RouterView>
        </main>
        <MobileMenu
            class="w-full border-t-2 border-t-zinc-100/25 dark:border-t-slate-700/50 lg:hidden"
        />
    </div>

    <Teleport to="body">
        <NotificationToastManager />
    </Teleport>
</template>
