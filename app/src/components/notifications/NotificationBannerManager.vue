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
        <NotificationBanner
            v-if="firstBanner"
            :key="firstBanner.id"
            :notification="firstBanner"
        />
    </div>
</template>
