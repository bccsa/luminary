<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import TopBar from "./navigation/TopBar.vue";
import MobileMenu from "./navigation/MobileMenu.vue";
import NotificationBannerManager from "./notifications/NotificationBannerManager.vue";
import NotificationToastManager from "./notifications/NotificationToastManager.vue";
import NotificationBottomManager from "./notifications/NotificationBottomManager.vue";

defineProps<{
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
    document.addEventListener("keydown", handleArrowKeyFocus);
});

onUnmounted(() => {
    document.removeEventListener("keydown", handleArrowKeyFocus);
});
</script>

<template>
    <div class="absolute bottom-0 left-0 right-0 top-0 flex flex-col">
        <TopBar
            :showBackButton="showBackButton"
            class="border-b-2 border-b-zinc-200/50 dark:border-b-slate-950/50"
        >
            <template #quickControls><slot name="quickControls" /></template>
        </TopBar>
        <NotificationBannerManager />
        <Teleport to="body">
            <NotificationToastManager />
        </Teleport>
        <main
            class="flex-1 overflow-y-scroll px-4 py-4 scrollbar-hide focus:outline-none dark:bg-slate-900"
            ref="main"
        >
            <slot />
        </main>

        <!-- slot for footer -->
        <div class="sticky bottom-0">
            <slot name="footer" />
            <NotificationBottomManager />
        </div>

        <MobileMenu
            class="w-full border-t-2 border-t-zinc-100/25 dark:border-t-slate-700/50 lg:hidden"
        />
    </div>
</template>
