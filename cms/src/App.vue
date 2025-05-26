<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import SideBar from "@/components/navigation/SideBar.vue";
import TopBar from "@/components/navigation/TopBar.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { computed, ref } from "vue";
import { Bars3Icon } from "@heroicons/vue/24/outline";
import { appName } from "@/globalConfig";
import MobileSideBar from "./components/navigation/MobileSideBar.vue";
import NotificationManager from "./components/notifications/NotificationManager.vue";
import router from "./router";
import BasePage from "./components/BasePage.vue";

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
        <main>
            <div class="w-full">
                <!-- The routeKey disables component reuse in cases where data needs to be reloaded for dynamic
                    routes (e.g. Post / Tag overviews) -->
                <RouterView :key="routeKey" />
            </div>
        </main>
    </template>

    <div v-else class="absolute flex h-full w-full items-center justify-center">
        <div class="flex flex-col items-center gap-4">
            <img class="w-72" src="@/assets/logo.svg" :alt="appName" />
            <div class="flex items-center gap-2 text-lg"><LoadingSpinner /> Loading...</div>
        </div>
    </div>

    <Teleport to="body">
        <NotificationManager />
    </Teleport>
</template>
