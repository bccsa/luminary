<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import TopBar from "./navigation/TopBar.vue";
import NotificationBannerManager from "./notifications/NotificationBannerManager.vue";
import NotificationToastManager from "./notifications/NotificationToastManager.vue";
import NotificationBottomManager from "./notifications/NotificationBottomManager.vue";
import { queryParams } from "@/globalConfig";
import type { ContentDto } from "luminary-shared";

const showNotifications = !queryParams.has("supress-notifications");

// On the web/SSG build the header chrome (TopBar/profile/language) and the
// notification managers depend on synced Dexie data, which doesn't exist during
// the Node prerender. Render them only AFTER mount so the prerendered HTML is the
// content-only baseline and the first client render still matches (clean
// hydration). On native this is always true → behaviour unchanged.
const isWeb = import.meta.env.VITE_BUILD_TARGET === "web";
const isMounted = ref(false);
const showChrome = computed(() => !isWeb || isMounted.value);

defineProps<{
    content?: ContentDto;
    showBackButton?: boolean;
}>();

const main = ref<HTMLElement | undefined>(undefined);

// Focus main content when arrow up or down is pressed to keep scrolling working even when focus was shifted to the top bar
const handleArrowKeyFocus = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (main.value) main.value.focus();
    }
};

onMounted(() => {
    isMounted.value = true;
    document.addEventListener("keydown", handleArrowKeyFocus);
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
});
</script>

<template>
    <div class="flex h-full w-full flex-col scrollbar-hide">
        <!-- TopBar (logo + nav links) IS prerendered for crawlable navigation; its
             per-user ProfileMenu is gated post-mount inside TopBar itself. -->
        <TopBar
            :showBackButton="showBackButton"
            class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50"
        >
            <template #quickControls><slot name="quickControls" /></template>
        </TopBar>
        <Teleport
            v-if="showChrome"
            to="body"
        >
            <NotificationToastManager v-if="showNotifications" />
        </Teleport>
        <main
            class="flex-1 overflow-y-scroll px-2 py-2 scrollbar-hide focus:outline-none dark:bg-slate-900"
            ref="main"
        >
            <NotificationBannerManager v-if="showNotifications && showChrome" />
            <slot />
        </main>

        <!-- slot for footer -->
        <div class="sticky bottom-0">
            <NotificationBottomManager v-if="showNotifications && showChrome" />
            <slot name="footer" />
        </div>
    </div>
</template>
