<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from "vue";
import TopBar from "./navigation/TopBar.vue";
import DesktopSidebar from "./navigation/DesktopSidebar.vue";
import NotificationBannerManager from "./notifications/NotificationBannerManager.vue";
import NotificationToastManager from "./notifications/NotificationToastManager.vue";
import NotificationBottomManager from "./notifications/NotificationBottomManager.vue";
import { queryParams } from "@/globalConfig";
import type { ContentDto } from "luminary-shared";
import { ChevronLeftIcon } from "@heroicons/vue/24/outline";
import { useBackNavigation } from "@/composables/useBackNavigation";

const showNotifications = !queryParams.has("supress-notifications");

// The desktop sidebar is prerendered; per-user notification chrome and the toast Teleport are gated behind `notificationsReady` so the prerendered HTML and first client render match (clean hydration). The normal SPA starts ready.
const isSSG = import.meta.env.VITE_BUILD_TARGET === "web";

// On the web/SSG tier, delay notifications briefly after hydration so account/offline banners don't shift content as the page settles (protects CLS/SEO). The normal SPA renders immediately.
const SSG_NOTIFICATION_DELAY_MS = 3000;
const notificationsReady = ref(!isSSG);

defineProps<{
    content?: ContentDto;
    showBackButton?: boolean;
    desktopTopBar?: boolean;
}>();

const { onBackClick } = useBackNavigation();

const main = ref<HTMLElement | undefined>(undefined);

// Expose the scrolling <main> to descendants (e.g. SearchPanel in page mode) so they can drive
// infinite scroll off the page's real scroll container instead of an internal one.
provide("appMainScrollEl", main);

const handleArrowKeyFocus = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (main.value) main.value.focus();
    }
};

onMounted(() => {
    if (isSSG) setTimeout(() => (notificationsReady.value = true), SSG_NOTIFICATION_DELAY_MS);
    document.addEventListener("keydown", handleArrowKeyFocus);
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
});
</script>

<template>
    <div class="flex h-full w-full scrollbar-hide">
        <!-- Desktop left sidebar — prerendered on the SSG build too (public nav /
             logo; the auth/Dexie bits self-defer inside the component). -->
        <DesktopSidebar />

        <!-- Content column -->
        <div class="flex min-w-0 flex-1 flex-col scrollbar-hide">
            <!-- Mobile top bar -->
            <TopBar
                :showBackButton="showBackButton"
                class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50 lg:hidden"
            >
                <template #quickControls><slot name="quickControls" /></template>
            </TopBar>

            <Teleport
                v-if="notificationsReady"
                to="body"
            >
                <NotificationToastManager v-if="showNotifications" />
            </Teleport>

            <main
                class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide focus:outline-none dark:bg-slate-900 md:max-lg:px-4"
                ref="main"
            >
                <!-- Desktop pinned chrome: back (left) + quick controls (right) stay fixed while scrolling.
                     Direct child of the scrolling <main> so `sticky` keeps it pinned the whole way.
                     -mb-9 collapses its flow height so page content originates at the top of the page,
                     sharing this row; pointer-events-none lets clicks fall through the empty centre. -->
                <div
                    v-if="desktopTopBar"
                    class="pointer-events-none sticky top-0 z-20 -mb-9 hidden h-9 items-center lg:flex"
                >
                    <RouterLink
                        v-if="showBackButton"
                        :to="{ name: 'home' }"
                        v-slot="{ href }"
                        custom
                    >
                        <a
                            :href="href"
                            class="pointer-events-auto flex-shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                            @click="onBackClick($event)"
                            aria-label="Go back"
                        >
                            <ChevronLeftIcon class="h-5 w-5" />
                        </a>
                    </RouterLink>
                    <div class="pointer-events-auto ml-auto flex items-center gap-2 pr-2">
                        <slot name="quickControls" />
                    </div>
                </div>

                <!-- Desktop notification: normal flow below the pinned chrome; pushes article down when present. -->
                <div
                    v-if="desktopTopBar"
                    class="hidden justify-center lg:flex"
                >
                    <div class="w-full lg:w-3/4 lg:max-w-3xl">
                        <NotificationBannerManager v-if="showNotifications && notificationsReady" />
                    </div>
                </div>

                <!-- Notification for mobile (desktopTopBar pages) and all non-desktopTopBar pages. -->
                <NotificationBannerManager
                    v-if="showNotifications && notificationsReady"
                    :class="desktopTopBar ? 'lg:hidden' : 'px-2'"
                />

                <slot />
            </main>

            <div class="sticky bottom-0">
                <NotificationBottomManager v-if="showNotifications && notificationsReady" />
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
