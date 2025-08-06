<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import LoadingBar from "@/components/LoadingBar.vue";
import { computed } from "vue";
import { appName } from "@/globalConfig";
import NotificationManager from "./components/notifications/NotificationManager.vue";
import router from "./router";

const { isAuthenticated } = useAuth0();

const routeKey = computed(() => {
    let routeKey = router.currentRoute.value.fullPath;

    // Check if the route is an overview route, and return a unique route key. This will disable component reuse for dynamic routes and allow the component to reload data
    if (routeKey.includes("tag/overview/") || routeKey.includes("post/overview/")) {
        return routeKey;
    }

    // Disable the route key for all other routes. This will enable component reuse for dynamic routes and prevent the component from reloading data
    return "";
});
</script>

<template>
    <template v-if="isAuthenticated">
        <div class="relative h-screen min-h-screen w-full overflow-hidden">
            <main class="absolute left-0 top-0 h-full w-full overflow-hidden pl-0">
                <div class="h-full w-full overflow-hidden">
                    <!-- The routeKey disables component reuse in cases where data needs to be reloaded for dynamic
                    routes (e.g. Post / Tag overviews) -->
                    <RouterView :key="routeKey" />
                </div>
            </main>
        </div>
    </template>

    <div v-else class="absolute flex h-full w-full items-center justify-center">
        <div class="flex flex-col items-center gap-4">
            <img class="w-72" src="@/assets/logo.svg" :alt="appName" />
            <div class="flex items-center gap-2 text-lg"><LoadingBar /></div>
        </div>
    </div>

    <Teleport to="body">
        <NotificationManager />
    </Teleport>
</template>
