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

        notifications.value = [];

        setTimeout(() => {
            notifications.value.push({
                ...notification,
                id: notificationId,
            });
        }, 100);

        if (notification.type == "toast") {
            setTimeout(() => {
                notifications.value = notifications.value.filter((n) => n.id != notificationId);
            }, 4000);
        }
    };

    return { notifications, addNotification };
});
