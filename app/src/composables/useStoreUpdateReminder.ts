import { ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { StorageSerializers, useLocalStorage } from "@vueuse/core";
import { useAppUpdate } from "@/composables/useAppUpdate";
import {
    isReminderDue,
    markReminderShown,
    reminderForVersion,
    type AppUpdateReminder,
} from "@/util/appUpdateReminder";

/**
 * Reminds the user of a newer store version on the schedule in `appUpdateReminder`,
 * keeping its progress across launches. `canPrompt` says whether the app may interrupt
 * the user at all; while it can't, a due reminder waits for a later store check.
 */
export function useStoreUpdateReminder(canPrompt: MaybeRefOrGetter<boolean>) {
    const { available, checkedAt, applyUpdate } = useAppUpdate();

    const reminder = useLocalStorage<AppUpdateReminder | null>("appUpdateReminder", null, {
        serializer: StorageSerializers.object,
    });
    const isOpen = ref(false);

    function remindIfDue() {
        // A reload update is offered by the update banner instead.
        if (isOpen.value || available.value?.kind !== "store") return;

        const now = Date.now();
        const current = reminderForVersion(reminder.value, available.value.version, now);
        reminder.value = current;

        if (!toValue(canPrompt) || !isReminderDue(current, now)) return;

        reminder.value = markReminderShown(current, now);
        isOpen.value = true;
    }

    // The store is checked when the app opens and each time it returns to the foreground,
    // which is when a reminder may have become due.
    watch([available, checkedAt], remindIfDue, { immediate: true });

    return {
        isOpen,
        update() {
            isOpen.value = false;
            applyUpdate();
        },
        later() {
            isOpen.value = false;
        },
    };
}
