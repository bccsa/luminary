import { defineStore } from "pinia";
import { computed, ref, type FunctionalComponent } from "vue";
import type { RouteLocationNamedRaw } from "vue-router";

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
    /**
     * Optional router link or function to call when the notification is clicked.
     */
    link?: RouteLocationNamedRaw | (() => void);
    timeout?: number;
    closable?: boolean;
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);
    const notifications = ref<Notification[]>([]);

    const addNotification = (notification: Notification) => {
        // Do not add the notification if the notification's ID is already in the list
        if (notifications.value.some((n) => n.id === notification.id)) {
            return notification.id;
        }

        // Prevent duplicate notifications
        if (notifications.value.some((n) => n.title === notification.title)) {
            return notification.id;
        }

        if (notification.closable == undefined) notification.closable = true;

        // Handle banners: Clear existing banners before adding the new one
        if (notification.type === "banner") {
            notifications.value = notifications.value.filter((n) => n.type !== "banner");
        }

        let notificationId = notification.id;
        if (!notificationId) {
            id.value++;
            notificationId = id.value;
        }

        // Handle banners: Ensure only one banner is displayed at a time
        if (
            notification.type === "banner" &&
            notifications.value.some((n) => n.type === "banner")
        ) {
            notifications.value = notifications.value.filter((n) => n.type !== "banner");
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
            }, notification.timeout || 4000);
        }

        return notificationId;
    };

    const banners = computed(() => {
        return notifications.value.filter((n) => n.type == "banner");
    });

    const removeNotification = (notificationId: number | string) => {
        notifications.value = notifications.value.filter((n) => n.id !== notificationId);
    };

    return { notifications, banners, addNotification, removeNotification };
});
