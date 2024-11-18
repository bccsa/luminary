<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { computed, onBeforeMount, ref, watch } from "vue";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";
import * as Sentry from "@sentry/vue";
import { db, DocType, getSocket, isConnected, type ContentDto } from "luminary-shared";
import { apiUrl, appLanguageIdAsRef, initLanguage } from "./globalConfig";
import NotificationToastManager from "./components/notifications/NotificationToastManager.vue";
import NotificationBannerManager from "./components/notifications/NotificationBannerManager.vue";
import { useNotificationStore } from "./stores/notification";
import { ExclamationCircleIcon, SignalSlashIcon } from "@heroicons/vue/24/solid";
import MobileMenu from "./components/navigation/MobileMenu.vue";
import { useRouter } from "vue-router";
import LModal from "./components/form/LModal.vue";
import LButton from "./components/button/LButton.vue";

const { isAuthenticated, user, getAccessTokenSilently, loginWithRedirect, logout } = useAuth0();
const router = useRouter();
// This const should be removed as we added it already in the bookmark feature
const userPreferences = JSON.parse(localStorage.getItem("userPreferences") || "{}");
const showModal = ref(false);
const privacyPolicyContent = ref<ContentDto[] | undefined>([]);

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
    if (userPreferences.privacyPolicy) {
        if (
            userPreferences.privacyPolicy.ts !== 0 &&
            privacyPolicyContent.value![0].updatedTimeUtc > userPreferences.privacyPolicy.ts
        ) {
            // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
            window._paq && user && user.value && window._paq.push(["setUserId", user.value.email]);
        }
    } else {
        // @ts-expect-error window is a native browser api, and matomo is attaching _paq to window
        window._paq && window._paq.push(["setUserId", "Anonymous"]);
    }

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
                });
            }

            if (isConnected.value) {
                useNotificationStore().removeNotification("offlineBanner");
            }
        },
        { immediate: true },
    );
}, 5000);

setTimeout(() => {
    watch(
        userPreferences.privacyPolicy,
        async () => {
            if (!userPreferences.privacyPolicy || userPreferences.privacyPolicy.ts === 0) {
                localStorage.setItem(
                    "userPreferences",
                    JSON.stringify({ ...userPreferences, privacyPolicy: { ts: 0 } }),
                );
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner",
                    type: "banner",
                    state: "info",
                    title: "Privacy Policy",
                    description: "By using this app, you agree to our privacy policy.",
                    routerLink: () => (showModal.value = true),
                });
            }

            privacyPolicyContent.value = await db.whereParent(
                import.meta.env.VITE_PRIVACY_POLICY_ID,
                DocType.Post,
                appLanguageIdAsRef.value,
            );

            if (
                userPreferences.privacyPolicy &&
                userPreferences.privacyPolicy.ts !== 0 &&
                privacyPolicyContent.value[0].updatedTimeUtc > userPreferences.privacyPolicy.ts
            ) {
                useNotificationStore().addNotification({
                    id: "privacy-policy-banner-updated",
                    type: "banner",
                    state: "info",
                    title: "Privacy Policy Updated",
                    description: "The privacy policy has been updated. Please review it.",
                    routerLink: () => (showModal.value = true),
                });
            }
        },

        { immediate: true },
    );
}, 1000);

function acceptPrivacyPolicy() {
    localStorage.setItem(
        "userPreferences",
        JSON.stringify({ ...userPreferences, privacyPolicy: { ts: Date.now() } }),
    );

    userPreferences.privacyPolicy.ts !== 0
        ? useNotificationStore().removeNotification("privacy-policy-banner")
        : null;

    privacyPolicyContent.value![0].updatedTimeUtc >= userPreferences.privacyPolicy.ts
        ? useNotificationStore().removeNotification("privacy-policy-banner-updated")
        : null;

    showModal.value = false;
}

function declinePrivacyPolicy() {
    localStorage.setItem(
        "userPreferences",
        JSON.stringify({ ...userPreferences, privacyPolicy: { ts: Date.now() } }),
    );
    showModal.value = false;
}

const routeKey = computed(() => {
    return router.currentRoute.value.fullPath;
});
</script>

<template>
    <div class="fixed flex h-dvh w-full flex-col">
        <TopBar class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50" />
        <NotificationBannerManager />

        <main class="flex-1 overflow-y-scroll px-6 pt-4 dark:bg-slate-900">
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

    <LModal :isVisible="showModal" heading="Privacy Policy" @close="declinePrivacyPolicy">
        <p class="mt-4 text-justify text-gray-700 dark:text-slate-300" v-if="privacyPolicyContent">
            {{
                privacyPolicyContent[0]?.updatedTimeUtc > userPreferences.privacyPolicy.ts
                    ? `We have updated our`
                    : `By using this app, you agree to our`
            }}

            <RouterLink
                :to="{ name: 'content', params: { slug: 'privacy-policy' } }"
                class="text-blue-600 underline dark:text-yellow-400"
                >privacy policy.</RouterLink
            >
            <br />{{
                privacyPolicyContent[0]?.updatedTimeUtc > userPreferences.privacyPolicy.ts
                    ? `The privacy policy has been updated. Please review it.`
                    : `Please accept our privacy policy to continue using this app. If you do not accept,
            the functionality of this app may be limited.`
            }}
        </p>
        <div class="mt-6 flex justify-end space-x-3 pt-4">
            <LButton variant="secondary" @click="declinePrivacyPolicy"> Decline </LButton>
            <LButton variant="primary" @click="acceptPrivacyPolicy"> Accept </LButton>
        </div>
    </LModal>
</template>
