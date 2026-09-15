<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import LDialog from "@/components/common/LDialog.vue";
import { useAppUpdate } from "@/composables/useAppUpdate";
import { userPreferencesAsRef } from "@/globalConfig";
import {
    isReminderDue,
    markReminderShown,
    reminderForVersion,
    type AppUpdateReminder,
} from "@/util/appUpdateReminder";

const { t } = useI18n();
const { storeVersion, storeCheckedAt, isUpdateAvailable, openStore } = useAppUpdate();

const reminder = useLocalStorage<AppUpdateReminder | null>("appUpdateReminder", null, {
    serializer: StorageSerializers.object,
});
const open = ref(false);

function remindIfDue() {
    if (open.value || !isUpdateAvailable.value || !storeVersion.value) return;

    const now = Date.now();
    const current = reminderForVersion(reminder.value, storeVersion.value, now);
    reminder.value = current;

    // A new user answers the privacy notice first; the reminder waits for a later opening.
    if (!userPreferencesAsRef.value.privacyPolicy?.status) return;
    if (!isReminderDue(current, now)) return;

    reminder.value = markReminderShown(current, now);
    open.value = true;
}

function update() {
    open.value = false;
    openStore();
}

function later() {
    open.value = false;
}

// The store is checked when the app opens and each time it returns to the foreground,
// which is when a reminder may have become due.
watch([storeVersion, isUpdateAvailable, storeCheckedAt], remindIfDue, { immediate: true });
</script>

<template>
    <LDialog
        v-model:open="open"
        :title="t('app_update.title')"
        :description="t('app_update.description')"
        :primary-action="update"
        :primary-button-text="t('app_update.button_update')"
        :secondary-action="later"
        :secondary-button-text="t('app_update.button_later')"
    />
</template>
