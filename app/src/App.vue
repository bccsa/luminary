<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import TopBar from "@/components/navigation/TopBar.vue";
import { onBeforeMount } from "vue";
import { waitUntilAuth0IsLoaded } from "./util/waitUntilAuth0IsLoaded";
import * as Sentry from "@sentry/vue";
import { getSocket } from "luminary-shared";
import { useGlobalConfigStore } from "@/stores/globalConfig";

const { getAccessTokenSilently, loginWithRedirect } = useAuth0();
const { apiUrl } = useGlobalConfigStore();

const getToken = async () => {
    try {
        return await getAccessTokenSilently();
    } catch (err) {
        Sentry.captureException(err);
        await loginWithRedirect({
            authorizationParams: {
                redirect_uri: window.location.origin,
            },
        });
        return;
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
</script>

<template>
    <TopBar class="sticky top-0 z-40" />

    <main class="px-6">
        <RouterView />
    </main>
</template>
