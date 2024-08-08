import { defineStore } from "pinia";
import { ref, type FunctionalComponent } from "vue";

export type Notification = {
    /**
     * Optional notification ID. If not provided, it will be generated. The ID is needed to remove the notification.
     */
    id?: number | string;
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
        // Do not add the notification if the notification's ID is already in the list
        if (notifications.value.some((n) => n.id === notification.id)) {
            return notification.id;
        }

        let notificationId = notification.id;
        if (!notificationId) {
            id.value++;
            notificationId = id.value;
        }

        setTimeout(() => {
            notifications.value.push({
                ...notification,
                id: notificationId,
            });
        }, 100);

        if (notification.type == "toast") {
            setTimeout(() => {
                removeNotification(notificationId!);
            }, 4000);
        }

        return notificationId;
    };

    const banners = notifications.value.filter((n) => n.type == "banner");

    const removeNotification = (notificationId: number | string) => {
        notifications.value = notifications.value.filter((n) => n.id !== notificationId);
    };

    return { notifications, banners, addNotification, removeNotification };
});
