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
    /** The centre slot is occupied before any scrolling; keep the row below the chrome clear for it. */
    reserveTopBarCenter?: boolean;
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
// Shared so whatever a page puts in the centre slot can reveal itself in step with the fade.
provide("topChromeScrolled", scrolled);
// Rendered as an always-present layer whose opacity animates, so the fade eases in rather
// than snapping on at the threshold. It overshoots the strip's top edge so browsers that
// place the sticky strip a few pixels lower still get a fade that reaches the top bar.
// Backing that lifts the pinned controls off whatever scrolls beneath them (hero images,
// text); fades in with the chrome so nothing changes at rest.
const controlBacking =
    "transition-[background-color,box-shadow] duration-500 ease-out rounded-lg ring-1 ring-transparent";
const controlBackingOn =
    "bg-zinc-200 shadow-md !ring-zinc-900/10 dark:bg-slate-700 dark:!ring-white/10";
// Same treatment applied to each quick control individually, so they read as separate pills.
const quickControlBacking =
    "[&>*]:rounded-lg [&>*]:ring-1 [&>*]:ring-transparent [&>*]:transition-[background-color,box-shadow] [&>*]:duration-500 [&>*]:ease-out";
const quickControlBackingOn =
    "[&>*]:bg-zinc-200 [&>*]:shadow-md [&>*]:!ring-zinc-900/10 dark:[&>*]:bg-slate-700 dark:[&>*]:!ring-white/10";
const topChromeFade =
    "pointer-events-none absolute inset-x-0 -top-4 bottom-0 bg-gradient-to-b from-white from-45% via-white/60 via-70% to-transparent transition-opacity duration-500 ease-out dark:from-slate-900 dark:via-slate-900/70";

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
                class="flex-1 overflow-y-scroll px-2 pb-2 scrollbar-hide focus:outline-none dark:bg-slate-900 md:max-lg:px-4"
                :class="desktopTopBar ? 'pt-0' : 'pt-2'"
                ref="main"
            >
                <!-- Desktop pinned chrome: back (left) + quick controls (right) stay fixed while scrolling.
                     Direct child of the scrolling <main> so `sticky` keeps it pinned the whole way.
                     <main> drops its top padding on these pages so `top-0` lands on the scrollport edge in
                     every engine; the strip's 8px of remaining flow height (h-16 minus -mb-14) stands in for
                     that padding, so page content still originates where it always did, sharing this row.
                     Negative side margins let it bleed over <main>'s horizontal padding; pointer-events-none
                     lets clicks fall through the empty centre.
                     The fade below the controls row lets content dissolve under the chrome. -->
                <div
                    v-if="desktopTopBar"
                    class="pointer-events-none sticky top-0 z-20 -mx-2 -mb-14 hidden h-16 items-start px-2 pt-2 lg:flex"
                >
                    <div
                        :class="[topChromeFade, scrolled ? 'opacity-100' : 'opacity-0']"
                        aria-hidden="true"
                    />
                    <div class="relative flex h-9 w-full items-center">
                        <!-- Centred on the full row (= the content column's axis) rather than
                             on the space left between the two asymmetric control groups. -->
                        <div class="pointer-events-none absolute inset-x-0 flex justify-center">
                            <div class="pointer-events-auto flex min-w-0 max-w-[calc(100%-16rem)]">
                                <slot name="topBarCenter" />
                            </div>
                        </div>
                        <RouterLink
                            v-if="showBackButton"
                            :to="{ name: 'home' }"
                            v-slot="{ href }"
                            custom
                        >
                            <a
                                :href="href"
                                class="pointer-events-auto relative z-10 flex-shrink-0 p-1.5 text-zinc-600 hover:bg-zinc-300 dark:text-slate-100 dark:hover:bg-slate-600"
                                :class="[controlBacking, { [controlBackingOn]: scrolled }]"
                                @click="onBackClick($event)"
                                aria-label="Go back"
                            >
                                <ChevronLeftIcon class="h-5 w-5" />
                            </a>
                        </RouterLink>
                        <div
                            class="pointer-events-auto relative z-10 ml-auto flex items-center gap-2 pr-2"
                            :class="[quickControlBacking, { [quickControlBackingOn]: scrolled }]"
                        >
                            <slot name="quickControls" />
                        </div>
                    </div>
                </div>

                <!-- Mobile counterpart of the centre slot: pinned at the top of the scrolling area with
                     the same collapsed flow height, so it floats over the content. -->
                <div
                    v-if="desktopTopBar && $slots.topBarCenter"
                    class="pointer-events-none sticky top-0 z-20 -mx-2 -mb-14 flex h-16 items-start justify-center px-2 pt-2 md:-mx-4 md:px-4 lg:hidden"
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

                <!-- Spacer that keeps in-flow content (banners, the page title) out from under a
                     centre-slot control that is showing before the page has scrolled. -->
                <div
                    v-if="desktopTopBar && reserveTopBarCenter"
                    class="h-11"
                />

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
