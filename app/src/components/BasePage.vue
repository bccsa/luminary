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
    /** Reading progress (0-100), rendered as a mobile bar above the bottom nav. Undefined hides it. */
    readingProgress?: number;
}>();

const { onBackClick } = useBackNavigation();

const main = ref<HTMLElement | undefined>(undefined);

// The fade under the pinned chrome only makes sense once body content has scrolled beneath
// it; until the strip's own height has gone by, what sits under it is still the page title.
const TOP_CHROME_H = 56;
const scrolled = ref(false);
const onMainScroll = () => {
    scrolled.value = (main.value?.scrollTop ?? 0) >= TOP_CHROME_H;
};
// Rendered as an always-present layer whose opacity animates, so the fade eases in rather
// than snapping on at the threshold.
const topChromeFade =
    "pointer-events-none absolute inset-0 bg-gradient-to-b from-white from-35% via-white/70 via-60% to-transparent transition-opacity duration-500 ease-out dark:from-slate-900 dark:via-slate-900/70";

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
    main.value?.addEventListener("scroll", onMainScroll, { passive: true });
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
    main.value?.removeEventListener("scroll", onMainScroll);
});
</script>

<template>
    <!-- Reading progress, mobile: sits right on top of the bottom nav bar. Teleported to
         <body> since nested overflow containers (App.vue's root, this main's
         overflow-y-scroll) can clip position:fixed descendants on mobile WebKit, even
         though they shouldn't per spec — escaping to body sidesteps that entirely. -->
    <Teleport to="body">
        <div
            v-if="readingProgress !== undefined"
            class="pointer-events-none fixed inset-x-0 z-[120] h-0.5 bg-yellow-500 transition-[width] duration-150 ease-out dark:bg-yellow-400 lg:hidden"
            :style="{ bottom: 'var(--mobile-menu-h, 78px)', width: `${readingProgress}%` }"
        />
    </Teleport>

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
                     -mb-20 collapses its flow height so page content originates at the top of the page,
                     sharing this row; pointer-events-none lets clicks fall through the empty centre.
                     The fade below the controls row lets content dissolve under the chrome. -->
                <div
                    v-if="desktopTopBar"
                    class="pointer-events-none sticky top-0 z-20 -mb-20 hidden h-20 items-start lg:flex"
                >
                    <div
                        :class="[topChromeFade, scrolled ? 'opacity-100' : 'opacity-0']"
                        aria-hidden="true"
                    />
                    <div class="relative flex h-9 w-full items-center">
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
                        <div class="pointer-events-auto mx-2 flex min-w-0 flex-1 justify-center">
                            <slot name="topBarCenter" />
                        </div>
                        <div class="pointer-events-auto ml-auto flex items-center gap-2 pr-2">
                            <slot name="quickControls" />
                        </div>
                    </div>
                </div>

                <!-- Mobile counterpart of the centre slot: pinned at the top of the scrolling
                     area with the same collapsed flow height, so it floats over the content. -->
                <div
                    v-if="$slots.topBarCenter"
                    class="pointer-events-none sticky top-0 z-20 -mb-20 flex h-20 items-start justify-center lg:hidden"
                >
                    <div
                        :class="[topChromeFade, scrolled ? 'opacity-100' : 'opacity-0']"
                        aria-hidden="true"
                    />
                    <div
                        class="pointer-events-auto relative flex h-9 min-w-0 max-w-full items-center justify-center"
                    >
                        <slot name="topBarCenter" />
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
