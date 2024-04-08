import { defineStore } from "pinia";
import { type Notification } from "@/types";
import { ref } from "vue";

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

        setTimeout(() => {
            notifications.value = notifications.value.filter((n) => n.id != notificationId);
        }, 2000);
    };

    return { notifications, addNotification };
});
