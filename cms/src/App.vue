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
import { isAuthBypassed, showProviderSelectionModal } from "@/auth";
import AuthProviderSelectionModal from "@/components/AuthProvider/AuthProviderSelectionModal.vue";

// In auth bypass mode, always treat as authenticated
const auth0 = isAuthBypassed ? null : useAuth0();
const isAuthenticated = computed(() => isAuthBypassed || auth0?.isAuthenticated.value);
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
        <div class="grid h-screen overflow-hidden lg:grid-cols-[18rem_1fr]">
            <MobileSideBar v-model:open="sidebarOpen" />

            <div class="hidden lg:flex lg:flex-col">
                <SideBar @close="sidebarOpen = false" />
            </div>

            <div class="min-h-0 min-w-0 overflow-hidden">
                <!-- The routeKey disables component reuse in cases where data needs to be reloaded for dynamic
                routes (e.g. Post / Tag overviews) -->
                <RouterView :key="routeKey" v-slot="{ Component }">
                    <component
                        :is="Component"
                        :onOpenMobileSidebar="() => (sidebarOpen = true)"
                    />
                </RouterView>
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
        <AuthProviderSelectionModal v-model:isVisible="showProviderSelectionModal" />
    </Teleport>
</template>
