<script setup lang="ts">
import NotificationBanner from "./NotificationBanner.vue";
import { useNotificationStore } from "@/stores/notification";
import { storeToRefs } from "pinia";
import { computed } from "vue";

const { banners } = storeToRefs(useNotificationStore());

// Only display 1 banner at a time, the first one in the list
const firstBanner = computed(() => {
    if (!banners.value[0]) return;
    return banners.value[0];
});
</script>

<template>
    <div aria-live="assertive">
        <Transition
            name="banner"
            mode="out-in"
        >
            <div
                v-if="firstBanner"
                :key="firstBanner.id"
                class="banner-grid"
            >
                <div class="banner-grid-content">
                    <NotificationBanner :notification="firstBanner" />
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.banner-grid {
    display: grid;
    grid-template-rows: 1fr;
    overflow: hidden;
}

.banner-grid-content {
    min-height: 0;
}

.banner-enter-from,
.banner-leave-to {
    grid-template-rows: 0fr;
    opacity: 0;
}

.banner-enter-to,
.banner-leave-from {
    grid-template-rows: 1fr;
    opacity: 1;
}

.banner-enter-active {
    transition:
        grid-template-rows 250ms ease-out,
        opacity 250ms ease-out;
}

.banner-leave-active {
    transition:
        grid-template-rows 250ms ease-in,
        opacity 250ms ease-in;
}
</style>
