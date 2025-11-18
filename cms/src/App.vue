<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import LoadingBar from "@/components/LoadingBar.vue";
import { computed, ref } from "vue";
import { appName } from "@/globalConfig";
import NotificationManager from "./components/notifications/NotificationManager.vue";
import router from "./router";
import MobileSideBar from "@/components/navigation/MobileSideBar.vue";
import SideBar from "@/components/navigation/SideBar.vue";

const { isAuthenticated } = useAuth0();
const sidebarOpen = ref(false);

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
        <div class="relative flex h-screen w-full overflow-hidden">
            <MobileSideBar v-model:open="sidebarOpen" />

            <div class="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-72 lg:flex-col">
                <SideBar @close="sidebarOpen = false" />
            </div>

            <div class="flex flex-1 flex-col lg:pl-72">
                <div class="h-full w-full overflow-hidden">
                    <!-- The routeKey disables component reuse in cases where data needs to be reloaded for dynamic
                    routes (e.g. Post / Tag overviews) -->
                    <RouterView :key="routeKey" v-slot="{ Component }">
                        <component :is="Component" @open-mobile-sidebar="sidebarOpen = true" />
                    </RouterView>
                </div>
            </div>
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
