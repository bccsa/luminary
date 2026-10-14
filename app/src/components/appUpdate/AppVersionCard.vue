<script setup lang="ts">
import { useI18n } from "vue-i18n";
import LButton from "@/components/button/LButton.vue";
import LCard from "@/components/common/LCard.vue";
import { useAppUpdate } from "@/composables/useAppUpdate";

const { t } = useI18n();
const { installedVersion, available, checkedAt, applyUpdate } = useAppUpdate();
</script>

<template>
    <LCard
        v-if="installedVersion"
        :title="t('settings.app_version.title')"
        data-test="appVersionCard"
    >
        <div class="text-sm text-zinc-600 dark:text-slate-100">
            <span class="font-semibold">{{ t("settings.app_version.installed") }}:</span>
            {{ installedVersion }}
        </div>
        <template v-if="available">
            <div
                class="mb-4 mt-2 text-sm text-zinc-600 dark:text-slate-100"
                data-test="appVersionUpdateAvailable"
            >
                {{ t("settings.app_version.update_available", { version: available.version }) }}
            </div>
            <LButton
                variant="primary"
                data-test="appVersionUpdateButton"
                @click="applyUpdate"
            >
                {{ t("app_update.button_update") }}
            </LButton>
        </template>
        <div
            v-else-if="checkedAt"
            class="mt-2 text-sm text-zinc-600 dark:text-slate-100"
            data-test="appVersionUpToDate"
        >
            {{ t("settings.app_version.up_to_date") }}
        </div>
    </LCard>
</template>
