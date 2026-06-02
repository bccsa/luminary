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
    document.addEventListener("keydown", handleArrowKeyFocus);
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
});
</script>

<template>
    <div class="flex h-full w-full scrollbar-hide">
        <!-- Desktop left sidebar -->
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

            <Teleport to="body">
                <NotificationToastManager v-if="showNotifications" />
            </Teleport>

            <main
                class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide focus:outline-none dark:bg-slate-900"
                ref="main"
            >
                <!-- Desktop pinned chrome: back (left) + quick controls (right) stay fixed while scrolling.
                     Direct child of the scrolling <main> so `sticky` keeps it pinned the whole way.
                     pointer-events-none lets clicks fall through the empty centre to the notification. -->
                <div
                    v-if="desktopTopBar"
                    class="pointer-events-none sticky top-0 z-20 hidden h-9 items-center lg:flex"
                >
                    <button
                        v-if="showBackButton"
                        class="pointer-events-auto -ml-1 flex-shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                        @click="isPostAndNoHistory ? router.push({ name: 'home' }) : router.back()"
                        aria-label="Go back"
                    >
                        <ChevronLeftIcon class="h-5 w-5" />
                    </button>
                    <div class="pointer-events-auto ml-auto flex items-center gap-2">
                        <slot name="quickControls" />
                    </div>
                </div>

                <!-- Desktop notification: scrolls with the content. Pulled up to sit on the same row
                     as the pinned chrome at scroll-top; min-height reserves the row when empty so the
                     article never slides under the pinned controls. Width matches the article column. -->
                <div
                    v-if="desktopTopBar"
                    class="-mt-9 mb-6 hidden min-h-[2.25rem] justify-center lg:flex"
                >
                    <div class="w-full lg:w-3/4 lg:max-w-3xl">
                        <NotificationBannerManager
                            v-if="showNotifications"
                            class="[&>div]:mb-0"
                        />
                    </div>
                </div>

                <!-- Notification for mobile (desktopTopBar pages) and all non-desktopTopBar pages -->
                <NotificationBannerManager
                    v-if="showNotifications"
                    :class="desktopTopBar ? 'lg:hidden' : ''"
                />

                <slot />
            </main>

            <div class="sticky bottom-0">
                <NotificationBottomManager v-if="showNotifications" />
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
