<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import TopBar from "./navigation/TopBar.vue";
import DesktopSidebar from "./navigation/DesktopSidebar.vue";
import NotificationBannerManager from "./notifications/NotificationBannerManager.vue";
import NotificationToastManager from "./notifications/NotificationToastManager.vue";
import NotificationBottomManager from "./notifications/NotificationBottomManager.vue";
import { queryParams } from "@/globalConfig";
import type { ContentDto } from "luminary-shared";
import { ChevronLeftIcon } from "@heroicons/vue/24/outline";
import { useRouter } from "vue-router";
import { getRouteHistory } from "@/router";

const showNotifications = !queryParams.has("supress-notifications");

// On the web/SSG build the desktop sidebar IS prerendered — its nav / logo /
// theme+language controls are public, the profile block self-gates on auth (false
// during the prerender, so it matches the first client render), and its
// interactive/Dexie-backed overlays mount client-side (see DesktopSidebar). What
// still cannot exist during the Node prerender is the per-user notification chrome
// (synced Dexie data) + the toast Teleport — those stay gated to AFTER mount so
// the prerendered HTML and the first client render match (clean hydration). On
// native showChrome is always true → behaviour unchanged.
const isWeb = import.meta.env.VITE_BUILD_TARGET === "web";
const isMounted = ref(false);
const showChrome = computed(() => !isWeb || isMounted.value);

// On the web/SSG tier, hold the notifications back a few seconds after hydration
// so the first paint stays still (the account/offline banners render in main flow
// and would otherwise shove content down right as the page settles — a layout
// shift that hurts CLS/SEO). Native renders them immediately (behaviour unchanged).
const WEB_NOTIFICATION_DELAY_MS = 3000; // ponytail: tune if CLS budget changes
const notificationsReady = ref(!isWeb);

defineProps<{
    content?: ContentDto;
    showBackButton?: boolean;
    desktopTopBar?: boolean;
}>();

const router = useRouter();

const isPostAndNoHistory = computed(
    () => getRouteHistory().value.length <= 1 && router.currentRoute.value.name === "content",
);

const main = ref<HTMLElement | undefined>(undefined);

const handleArrowKeyFocus = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (main.value) main.value.focus();
    }
};

onMounted(() => {
    isMounted.value = true;
    if (isWeb) setTimeout(() => (notificationsReady.value = true), WEB_NOTIFICATION_DELAY_MS);
    document.addEventListener("keydown", handleArrowKeyFocus);
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
});
</script>

<template>
    <div class="flex h-full w-full scrollbar-hide">
        <!-- Desktop left sidebar — prerendered on the web build too (public nav /
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
                class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide focus:outline-none dark:bg-slate-900"
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
                    <button
                        v-if="showBackButton"
                        class="pointer-events-auto flex-shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                        @click="isPostAndNoHistory ? router.push({ name: 'home' }) : router.back()"
                        aria-label="Go back"
                    >
                        <ChevronLeftIcon class="h-5 w-5" />
                    </button>
                    <div class="pointer-events-auto ml-auto flex items-center gap-2 pr-2">
                        <slot name="quickControls" />
                    </div>
                </div>

                <!-- Desktop notification: normal flow below the pinned chrome; pushes article down when present.
                     [&>div]:mb-2 trims the banner's default mb-4 so the gap above the title matches the page-top gap. -->
                <div
                    v-if="desktopTopBar"
                    class="hidden justify-center lg:flex"
                >
                    <div class="w-full lg:w-3/4 lg:max-w-3xl">
                        <NotificationBannerManager
                            v-if="showNotifications && notificationsReady"
                            class="[&>div]:mb-2"
                        />
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
