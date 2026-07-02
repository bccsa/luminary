<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LToggle from "@/components/form/LToggle.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { db, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useI18n } from "vue-i18n";
import {
    getDeviceInfo,
    isDataSaverEnabled,
    userDataSaverEnabled,
    localCacheVersion,
} from "@/globalConfig";
import { useNetworkSpeedEstimator } from "@/composables/useNetworkSpeedEstimator";
import BasePage from "@/components/BasePage.vue";
import { triggerSync } from "@/sync";
import { markPageReady } from "@/util/renderState";

const { t } = useI18n();

onMounted(async () => {
    await nextTick();
    markPageReady();
});

const { addNotification } = useNotificationStore();

const deviceInfo = getDeviceInfo();

// Live, probe-based connection-speed estimate (refreshes itself on focus / regained connectivity).
const { connectionSpeed, isSlowConnection } = useNetworkSpeedEstimator();
const browserDataSaverEnabled = isDataSaverEnabled();
const dataSaverToggleValue = computed(() => userDataSaverEnabled.value || browserDataSaverEnabled);
const dataSaverNote = computed(() => {
    if (browserDataSaverEnabled) return t("settings.data_saver.browser_note");
    if (isSlowConnection.value && !userDataSaverEnabled.value) {
        return t("settings.data_saver.slow_connection_note");
    }
    return "";
});
const setUserDataSaverEnabled = (enabled: boolean) => {
    userDataSaverEnabled.value = enabled;
};

const isClearing = ref(false);

const deleteLocalData = async () => {
    if (!isConnected.value) {
        return addNotification({
            title: t("notification.clearCache_offline.title"),
            description: t("notification.clearCache_offline.description"),
            state: "error",
            type: "toast",
        });
    }

    isClearing.value = true;
    try {
        await db.purge();
        // Invalidate the kept-alive overview pages so they re-create from the now-empty cache
        // instead of showing their pre-purge state.
        localCacheVersion.value++;
        triggerSync();

        addNotification({
            title: t("notification.clearCache_success.title"),
            description: t("notification.clearCache_success.description"),
            state: "success",
            type: "toast",
        });
    } finally {
        isClearing.value = false;
    }
};
</script>

<template>
    <BasePage showBackButton>
        <div class="space-y-4 px-2">
            <LCard :title="t('settings.local_cache.title')">
                <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                    {{ t("settings.local_cache.description") }}
                </div>
                <LButton
                    @click="deleteLocalData"
                    :disabled="isClearing"
                    :icon="isClearing ? LoadingSpinner : undefined"
                    data-test="deleteLocalDatabase"
                >
                    {{
                        isClearing
                            ? t("settings.local_cache.button_clearing")
                            : t("settings.local_cache.button")
                    }}
                </LButton>
            </LCard>
            <LCard :title="t('settings.device_info.title')">
                <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                    {{ t("settings.device_info.description") }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">OS:</span>
                    {{ deviceInfo.platform }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Browser:</span>
                    {{ deviceInfo.userAgent }}
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Connection speed:</span>
                    {{ connectionSpeed.toFixed(1) }} Mbps
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Connection state:</span>
                    {{ isConnected ? "Online" : "Offline" }}
                </div>
            </LCard>
            <LCard :title="t('settings.data_saver.title')">
                <div class="flex items-center justify-between gap-4">
                    <div class="text-sm text-zinc-600 dark:text-slate-100">
                        {{ t("settings.data_saver.description") }}
                    </div>
                    <LToggle
                        :modelValue="dataSaverToggleValue"
                        :disabled="browserDataSaverEnabled"
                        @update:modelValue="setUserDataSaverEnabled"
                        data-test="dataSaverToggle"
                    />
                </div>
                <div
                    v-if="dataSaverNote"
                    class="mt-3 text-sm text-zinc-600 dark:text-slate-100"
                    data-test="dataSaverNote"
                >
                    {{ dataSaverNote }}
                </div>
            </LCard>
        </div>
    </BasePage>
</template>
