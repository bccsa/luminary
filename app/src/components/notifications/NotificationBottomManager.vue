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
    <div aria-live="assertive" class="sticky inset-x-0 flex items-end sm:items-start">
        <div class="w-full">
            <NotificationBottom
                v-if="firstBanner"
                :key="firstBanner.id"
                :notification="firstBanner"
            />
        </div>
    </div>
</template>
