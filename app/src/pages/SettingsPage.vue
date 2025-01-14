<script setup lang="ts">
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { db, api, isConnected } from "luminary-shared";
import { useNotificationStore } from "@/stores/notification";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const { addNotification } = useNotificationStore();

const deleteLocalData = async () => {
    if (!isConnected.value) {
        return addNotification({
            title: t("notification.clearCache_offline.title"),
            description: t("notification.clearCache_offline.description"),
            state: "error",
            type: "toast",
        });
    }

    await db.purge();
    api().rest().clientDataReq();

    return addNotification({
        title: t("notification.clearCache_success.title"),
        description: t("notification.clearCache_success.description"),
        state: "success",
        type: "toast",
    });
};
</script>

<template>
    <div>
        <h1 class="mb-4 text-xl font-medium">{{ t("profile_menu.settings") }}</h1>

        <LCard :title="t('settings.local_cache.title')">
            <div class="mb-4 text-sm text-zinc-600 dark:text-slate-100">
                {{ t("settings.local_cache.description") }}
            </div>
            <LButton @click="deleteLocalData" data-test="deleteLocalDatabase">
                {{ t("settings.local_cache.button") }}
            </LButton>
        </LCard>
    </div>
</template>
