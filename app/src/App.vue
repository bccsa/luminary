<script setup lang="ts">
import { RouterView } from "vue-router";
import { computed, onErrorCaptured, watchEffect } from "vue";
import { isConnected } from "luminary-shared";
import { userPreferencesAsRef } from "./globalConfig";
import { useNotificationStore } from "./stores/notification";
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import * as Sentry from "@sentry/vue";
import { useRouter } from "vue-router";
import PrivacyPolicyModal from "@/components/navigation/PrivacyPolicyModal.vue";
import { useAuthWithPrivacyPolicy } from "@/composables/useAuthWithPrivacyPolicy";

const router = useRouter();
const store = useNotificationStore();

const {
    isAuthenticated,
    user,
    loginWithRedirect,
    isPrivacyPolicyAccepted,
    showPrivacyPolicyModal,
    completePendingLogin,
    cancelPendingLogin,
} = useAuthWithPrivacyPolicy();

/**
 * ✅ Un seul watchEffect pour gérer connexion + auth + privacy policy
 */
watchEffect(() => {
    // 🕵️ Privacy Policy acceptance
    if (isPrivacyPolicyAccepted.value) {
        completePendingLogin();
    }

    // 🌐 Connection state
    if (!isConnected.value) {
        store.addNotification({
            id: "offlineBanner",
            title: "You are offline",
            description:
                "You can still use the app and browse offline content, but some features (like videos) might not be available.",
            state: "warning",
            type: "banner",
            icon: SignalSlashIcon,
            priority: 1,
        });
    } else {
        store.removeNotification("offlineBanner");
    }

    // 👤 Authentication reminder
    if (isConnected.value && !isAuthenticated.value) {
        store.addNotification({
            id: "accountBanner",
            title: "You are missing out!",
            description: "Click here to create an account or log in.",
            state: "warning",
            type: "banner",
            icon: ExclamationCircleIcon,
            link: () => loginWithRedirect(),
        });
    } else {
        store.removeNotification("accountBanner");
    }

    // 🔍 Matomo tracking
    if (userPreferencesAsRef.value.privacyPolicy?.status === "accepted" && isAuthenticated.value) {
        // @ts-expect-error matomo global var
        window._paq?.push(["setUserId", user.value?.email]);
    }
});

const handleModalClose = () => cancelPendingLogin();

const routeKey = computed(() => router.currentRoute.value.fullPath);

onErrorCaptured((err) => {
    console.error(err);
    Sentry.captureException(err);
});
</script>

<template>
    <RouterView v-slot="{ Component }">
        <KeepAlive include="HomePage,ExplorePage,VideoPage">
            <component :is="Component" :key="routeKey" />
        </KeepAlive>
    </RouterView>

    <PrivacyPolicyModal v-model:show="showPrivacyPolicyModal" @close="handleModalClose" />
</template>