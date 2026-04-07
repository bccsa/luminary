<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import LDialog from "@/components/common/LDialog.vue";
import { isTelegramInAppBrowser } from "@/util/inAppBrowser";

const route = useRoute();
const router = useRouter();
const open = ref(false);
const isNavigatingAway = ref(false);

const targetPath = computed(() => {
    const to = route.query.to;
    if (typeof to !== "string" || !to.startsWith("/")) return "/";
    return to;
});

function continueToApp() {
    isNavigatingAway.value = true;
    sessionStorage.setItem("telegram_open_warning_ack", "1");
    open.value = false;
    router.replace(targetPath.value);
}

function cancel() {
    isNavigatingAway.value = true;
    sessionStorage.setItem("telegram_open_warning_ack", "1");
    open.value = false;
    if (window.history.length > 1) router.back();
    else router.replace("/");
}

onMounted(() => {
    // Prevent showing the warning when user navigates to /open manually
    // or from a non-Telegram browser.
    if (!isTelegramInAppBrowser()) {
        router.replace(targetPath.value);
        return;
    }
    open.value = true;
});

// If user dismisses via backdrop/escape, treat it as "Cancel".
watch(open, (v) => {
    if (v) return;
    if (isNavigatingAway.value) return;
    cancel();
});
</script>

<template>
    <div class="min-h-[70vh]">
        <LDialog
            v-model:open="open"
            title="This link will open Luminary"
            description="You opened this link inside Telegram. If you continue, we’ll open Luminary to show the content."
            :primaryAction="continueToApp"
            primaryButtonText="Continue"
            :secondaryAction="cancel"
            secondaryButtonText="Cancel"
        />
    </div>
</template>

