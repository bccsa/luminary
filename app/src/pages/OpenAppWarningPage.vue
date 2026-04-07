<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import LDialog from "@/components/common/LDialog.vue";
import { isTelegramBrowser } from "@/util/inAppBrowser";
import { appName } from "@/globalConfig";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
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
    if (!isTelegramBrowser()) {
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
            :title="t('openapp_warning.title', { appName })"
            :description="t('openapp_warning.description', { appName })"
            :primaryAction="continueToApp"
            :primaryButtonText="t('openapp_warning.button_continue')"
            :secondaryAction="cancel"
            :secondaryButtonText="t('openapp_warning.button_cancel')"
        />
    </div>
</template>

