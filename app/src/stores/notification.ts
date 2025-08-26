import { defineStore } from "pinia";
import { computed, ref, type FunctionalComponent, type VNode } from "vue";
import type { RouteLocationNamedRaw } from "vue-router";

export type Notification = {
    /**
     * Optional notification ID. If not provided, it will be generated. The ID is needed to remove the notification.
     */
    id?: number | string;
    title: string;
    description?: string;
    state: "success" | "error" | "info" | "warning";
    type: "toast" | "banner" | "bottom";
    icon?: FunctionalComponent;
    /**
     * Optional router link or function to call when the notification is clicked.
     */
    link?: RouteLocationNamedRaw | (() => void);
    timeout?: number;
    closable?: boolean;
    /**
     * Priority of the notification. Higher priority (lower number) notifications will be displayed first. Default is 10.
     */
    priority?: number;
    openLink?: boolean;
    actions?: FunctionalComponent | VNode | VNode[];
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);
    const notifications = ref<Notification[]>([]);

    const addNotification = (notification: Notification) => {
        // Set default values
        if (notification.closable == undefined) notification.closable = true;
        if (notification.priority == undefined) notification.priority = 10;
        if (notification.openLink == undefined) notification.openLink = false;

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
            notifications.value.sort((a, b) => a.priority! - b.priority!);
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

    const bottomBanners = computed(() => {
        return notifications.value.filter((n) => n.type == "bottom");
    });

    const removeNotification = (notificationId: number | string) => {
        notifications.value = notifications.value.filter((n) => n.id !== notificationId);
    };

    return { notifications, banners, bottomBanners, addNotification, removeNotification };
});
