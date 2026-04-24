<script setup lang="ts">
import { ref } from "vue";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { db, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useI18n } from "vue-i18n";
import { getDeviceInfo } from "@/globalConfig";
import BasePage from "@/components/BasePage.vue";
import { triggerSync } from "@/sync";

const { t } = useI18n();

const { addNotification } = useNotificationStore();

const deviceInfo = getDeviceInfo();

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
        <div class="space-y-4">
            <h1 class="text-xl font-medium">{{ t("profile_menu.settings") }}</h1>

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
                    {{ deviceInfo.connectionSpeed }} Mbps
                </div>
                <div class="text-sm text-zinc-600 dark:text-slate-100">
                    <span class="font-semibold">Connection state:</span>
                    {{ isConnected ? "Online" : "Offline" }}
                </div>
            </LCard>
        </div>
    </BasePage>
</template>
