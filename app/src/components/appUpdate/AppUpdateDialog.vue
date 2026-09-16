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
const { available, checkedAt, applyUpdate } = useAppUpdate();

const reminder = useLocalStorage<AppUpdateReminder | null>("appUpdateReminder", null, {
    serializer: StorageSerializers.object,
});
const open = ref(false);

function remindIfDue() {
    // A reload update is offered by the update banner instead.
    if (open.value || available.value?.kind !== "store") return;

    const now = Date.now();
    const current = reminderForVersion(reminder.value, available.value.version, now);
    reminder.value = current;

    // A new user answers the privacy notice first; the reminder waits for a later opening.
    if (!userPreferencesAsRef.value.privacyPolicy?.status) return;
    if (!isReminderDue(current, now)) return;

    reminder.value = markReminderShown(current, now);
    open.value = true;
}

function update() {
    open.value = false;
    applyUpdate();
}

function later() {
    open.value = false;
}

// The store is checked when the app opens and each time it returns to the foreground,
// which is when a reminder may have become due.
watch([available, checkedAt], remindIfDue, { immediate: true });
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
