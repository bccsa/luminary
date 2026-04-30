<script setup lang="ts">
import { RouterView } from "vue-router";
import { computed, inject, onErrorCaptured, watch } from "vue";
import { isConnected } from "luminary-shared";
import { appName, isAppLoading, userPreferencesAsRef, mediaQueue } from "./globalConfig";
import LoadingBar from "@/components/LoadingBar.vue";
import { useNotificationStore } from "./stores/notification";
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import * as Sentry from "@sentry/vue";
import { useRouter } from "vue-router";
import PrivacyPolicyModal from "@/components/navigation/PrivacyPolicyModal.vue";
import SearchModal from "@/components/navigation/SearchModal.vue";
import MobileMenu from "@/components/navigation/MobileMenu.vue";
import { useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";
import { showProviderSelectionModal } from "@/auth";
import AuthProviderSelectionModal from "@/components/authProvider/AuthProviderSelectionModal.vue";
import { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";

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

const mediaPlayerService = inject(MediaPlayerKey);
if (!mediaPlayerService) {
    throw new Error("MediaPlayerService not provided");
}

onErrorCaptured((err) => {
    console.error(err);
    Sentry.captureException(err);
});
</script>

<template>
    <div
        v-if="isAppLoading"
        class="absolute flex h-full w-full items-center justify-center"
    >
        <div class="flex flex-col items-center gap-4">
            <img
                class="w-72"
                src="@/assets/logo.svg"
                :alt="appName"
            />
            <LoadingBar />
        </div>
    </div>

    <div
        v-else
        class="absolute bottom-0 left-0 right-0 top-0 flex w-full flex-col overflow-hidden"
    >
        <div class="flex-1 overflow-y-scroll scrollbar-hide">
            <RouterView v-slot="{ Component }">
                <KeepAlive include="HomePage,ExplorePage,VideoPage">
                    <component
                        :is="Component"
                        :key="routeKey"
                    />
                </KeepAlive>
            </RouterView>
        </div>

        <!-- Bottom menu divider for mobile view -->
        <!-- <div class="w-full lg:hidden h-[2px] bg-zinc-100/25 dark:bg-slate-700/50"></div> -->
        <!-- Global Audio Player for All Devices -->
        <!-- AudioPlayer now uses fixed positioning internally, so no wrapper positioning needed -->
        <div v-if="mediaQueue.length > 0">
            <component :is="mediaPlayerService.getGlobalAudioPlayerComponent()" :content="mediaQueue[0]" />
        </div>

        <!-- Mobile Navigation (mobile only) -->
        <!-- <MobileMenu class="w-full lg:hidden z-10" /> -->
        <MobileMenu
            class="z-50 w-full border-t-2 border-t-zinc-100/25 dark:border-t-slate-700/50 lg:hidden"
        />

        <!-- Privacy Policy Modal for authentication flow -->
        <PrivacyPolicyModal
            v-model:show="showPrivacyPolicyModal"
            @close="handleModalClose"
        />
    </div>
    <!-- Modals depend on i18n, which isn't installed until splash finishes — keep them out of the tree during the loading phase. -->
    <template v-if="!isAppLoading">
        <SearchModal />
        <AuthProviderSelectionModal v-model:isVisible="showProviderSelectionModal" />
    </template>
</template>
