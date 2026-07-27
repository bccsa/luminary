<script setup lang="ts">
import NotificationBottom from "./NotificationBottom.vue";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const { bottomBanners } = storeToRefs(useNotificationStore());

// Only display 1 banner at a time, the first one in the list
const firstBanner = computed(() => {
    if (!bottomBanners.value[0]) return;
    return bottomBanners.value[0];
});
</script>

<template>
    <div
        aria-live="assertive"
        class="sticky inset-x-0 flex items-end sm:items-start"
    >
        <div class="w-full">
            <Transition
                name="bottom-banner"
                mode="out-in"
            >
                <div
                    v-if="firstBanner"
                    :key="firstBanner.id"
                    class="bottom-banner-grid"
                >
                    <div class="bottom-banner-grid-content">
                        <NotificationBottom :notification="firstBanner" />
                    </div>
                </div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.bottom-banner-grid {
    display: grid;
    grid-template-rows: 1fr;
    overflow: hidden;
}

.bottom-banner-grid-content {
    min-height: 0;
}

.bottom-banner-enter-from,
.bottom-banner-leave-to {
    grid-template-rows: 0fr;
    opacity: 0;
}

.bottom-banner-enter-to,
.bottom-banner-leave-from {
    grid-template-rows: 1fr;
    opacity: 1;
}

.bottom-banner-enter-active {
    transition:
        grid-template-rows 250ms ease-out,
        opacity 250ms ease-out;
}

.bottom-banner-leave-active {
    transition:
        grid-template-rows 250ms ease-in,
        opacity 250ms ease-in;
}
</style>
