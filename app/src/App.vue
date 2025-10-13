<script setup lang="ts">
import { RouterView } from "vue-router";
import { computed, onErrorCaptured, watch } from "vue";
import { isConnected } from "luminary-shared";
import { userPreferencesAsRef, mediaQueue } from "./globalConfig";
import { useNotificationStore } from "./stores/notification";
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import * as Sentry from "@sentry/vue";
import { useRouter } from "vue-router";
import PrivacyPolicyModal from "@/components/navigation/PrivacyPolicyModal.vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import MobileMenu from "@/components/navigation/MobileMenu.vue";
import { useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";

const router = useRouter();
const {
    isAuthenticated,
    user,
    loginWithRedirect,
    isPrivacyPolicyAccepted,
    showPrivacyPolicyModal,
    completePendingLogin,
    cancelPendingLogin,
} = useAuthWithPrivacyPolicy();

// Watch for privacy policy acceptance to complete pending login
watch(isPrivacyPolicyAccepted, (accepted) => {
    if (accepted) {
        completePendingLogin();
    }
});

// Handle modal close
const handleModalClose = () => {
    cancelPendingLogin();
};

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
                    link: () => loginWithRedirect(),
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
        if (isAuthenticated.value) {
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq && user && user.value && window._paq.push(["setUserId", user.value.email]);
        }
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
</script>

<template>
    <div class="bottom-0 left-0 right-0 top-0 flex w-full flex-col">
        <div class="flex-1">
            <RouterView v-slot="{ Component }">
                <KeepAlive include="HomePage,ExplorePage,VideoPage">
                    <component :is="Component" :key="routeKey" />
                </KeepAlive>
            </RouterView>
        </div>

        <!-- Global Audio Player for All Devices -->
        <div v-if="mediaQueue.length > 0" class="fixed bottom-0 left-0 right-0 z-40">
            <!-- Single Audio Player for all screen sizes -->
            <div class="flex justify-center pb-[78px] lg:pb-4">
                <div class="w-full lg:max-w-md">
                    <AudioPlayer :content="mediaQueue[0]" />
                </div>
            </div>
        </div>

        <!-- Mobile Navigation (mobile only) -->
        <MobileMenu
            class="w-full border-t-2 border-t-zinc-100/25 dark:border-t-slate-700/50 lg:hidden"
        />
    </div>
    <!-- Privacy Policy Modal for authentication flow -->
    <PrivacyPolicyModal v-model:show="showPrivacyPolicyModal" @close="handleModalClose" />
</template>
