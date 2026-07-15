import { defineStore } from "pinia";
import { ref } from "vue";

export type Notification = {
    id?: number;
    title: string;
    description?: string;
    state?: "success" | "error" | "info" | "warning";
    timer?: number;
    // Stays until explicitly removed (no auto-dismiss timer) and survives other
    // notifications being added — for things the user must act on, like a pending reload.
    persist?: boolean;
    action?: {
        label: string;
        onClick: () => void;
    };
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);

    const notifications = ref<Notification[]>([]);

    const removeNotification = (notificationId: number) => {
        notifications.value = notifications.value.filter((n) => n.id != notificationId);
    };

    const addNotification = (notification: Notification): void => {
        const notificationId = id.value++;

        // Only one transient notification at a time, but persistent ones (e.g. the
        // update-available prompt) must not be wiped out by unrelated toasts.
        notifications.value = notifications.value.filter((n) => n.persist);

        if (notification.persist) {
            notifications.value.push({ ...notification, id: notificationId });
            return;
        }

        setTimeout(() => {
            notifications.value.push({
                ...notification,
                id: notificationId,
            });
        }, 100);

        setTimeout(
            () => removeNotification(notificationId),
            notification.timer ? notification.timer : 5000,
        );
    };

    return { notifications, addNotification, removeNotification };
});
