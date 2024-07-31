import { defineStore } from "pinia";
import { ref, type FunctionalComponent } from "vue";

export type Notification = {
    id?: number;
    title: string;
    description?: string;
    state: "success" | "error" | "info" | "warning";
    type: "toast" | "banner";
    icon?: FunctionalComponent;
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);

    const notifications = ref<Notification[]>([]);

    const addNotification = (notification: Notification) => {
        const notificationId = id.value++;
        const notificationType = notification.type || "toast";

        notifications.value = [];

        setTimeout(() => {
            notifications.value.push({
                ...notification,
                id: notificationId,
                type: notificationType,
            });
        }, 100);

        setTimeout(() => {
            notifications.value = notifications.value.filter((n) => n.id != notificationId);
        }, 2000);
    };

    return { notifications, addNotification };
});
