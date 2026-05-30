<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useSlots } from "vue";
import TopBar from "./navigation/TopBar.vue";
import DesktopSidebar from "./navigation/DesktopSidebar.vue";
import NotificationBannerManager from "./notifications/NotificationBannerManager.vue";
import NotificationToastManager from "./notifications/NotificationToastManager.vue";
import NotificationBottomManager from "./notifications/NotificationBottomManager.vue";
import { queryParams } from "@/globalConfig";
import type { ContentDto } from "luminary-shared";
import { ChevronLeftIcon } from "@heroicons/vue/24/solid";
import { useRouter } from "vue-router";
import { getRouteHistory } from "@/router";

const showNotifications = !queryParams.has("supress-notifications");

defineProps<{
    content?: ContentDto;
    showBackButton?: boolean;
}>();

const router = useRouter();
const slots = useSlots();

const isPostAndNoHistory = computed(
    () =>
        getRouteHistory().value.length <= 1 &&
        router.currentRoute.value.name === "content",
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

            <!-- Desktop content header: back button + quickControls (only when needed) -->
            <div
                v-if="showBackButton || slots.quickControls"
                class="hidden items-center gap-3 border-b border-zinc-200/50 bg-zinc-100 px-4 py-3 dark:border-slate-950/50 dark:bg-slate-800 lg:flex"
            >
                <button
                    v-if="showBackButton"
                    class="-ml-1 rounded-md p-1 text-zinc-600 hover:bg-zinc-200 dark:text-slate-100 dark:hover:bg-slate-700"
                    @click="isPostAndNoHistory ? router.push({ name: 'home' }) : router.back()"
                    aria-label="Go back"
                >
                    <ChevronLeftIcon class="h-5 w-5" />
                </button>
                <slot name="quickControls" />
            </div>

            <Teleport to="body">
                <NotificationToastManager v-if="showNotifications" />
            </Teleport>

            <main
                class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide focus:outline-none dark:bg-slate-900"
                ref="main"
            >
                <NotificationBannerManager v-if="showNotifications" />
                <slot />
            </main>

            <div class="sticky bottom-0">
                <NotificationBottomManager v-if="showNotifications" />
                <slot name="footer" />
            </div>
        </div>
    </div>
</template>
