<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { RouterView } from "vue-router";
import SideBar from "@/components/navigation/SideBar.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { computed, ref } from "vue";
import { Bars3Icon } from "@heroicons/vue/24/outline";
import { appName } from "@/globalConfig";
import MobileSideBar from "./components/navigation/MobileSideBar.vue";
import NotificationManager from "./components/notifications/NotificationManager.vue";
import router from "./router";

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
        <MobileSideBar v-model:open="sidebarOpen" />

        <!-- Static sidebar for desktop -->
        <div class="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-72 lg:flex-col">
            <SideBar />
        </div>

        <!-- Top bar -->
        <div class="lg:pl-72">
            <div
                class="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-zinc-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8"
            >
                <button
                    type="button"
                    class="-m-2.5 p-2.5 text-zinc-700 lg:hidden"
                    @click="sidebarOpen = true"
                >
                    <span class="sr-only">Open sidebar</span>
                    <Bars3Icon class="h-6 w-6" aria-hidden="true" />
                </button>

                <!-- Separator -->
                <div class="h-6 w-px bg-zinc-900/10 lg:hidden" aria-hidden="true" />

                <main class="py-4">
                    <div class="px-4 sm:px-6 lg:px-8">
                        <!-- The routeKey disables component reuse in cases where data needs to be reloaded for dynamic
                    routes (e.g. Post / Tag overviews) -->
                        <RouterView :key="routeKey" />
                    </div>
                </main>
            </div>
        </div>
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
