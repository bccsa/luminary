import { defineStore } from "pinia";
import { ref } from "vue";

export type Notification = {
    id?: number;
    title: string;
    description?: string;
    state?: "success" | "error" | "info" | "warning";
    timer?: number;
    click?: () => void; // click handler (e.g., reload on update)
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);

    const notifications = ref<Notification[]>([]);

    const addNotification = (notification: Notification) => {
        const notificationId = id.value++;

        notifications.value = [];

        setTimeout(() => {
            notifications.value.push({
                ...notification,
                id: notificationId,
            });
        }, 100);

        setTimeout(
            () => {
                notifications.value = notifications.value.filter((n) => n.id != notificationId);
            },
            notification.timer ? notification.timer : 5000,
        );
    };

    return { notifications, addNotification };
});
