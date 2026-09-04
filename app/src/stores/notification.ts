import { defineStore } from "pinia";
import { computed, ref, type FunctionalComponent, type VNode } from "vue";
import type { RouteLocationNamedRaw } from "vue-router";

/**
 * Notification text is either a plain string or a getter. Persistent notifications
 * (banners/bottom) should pass a getter `() => t("key")` so the text re-resolves
 * when the app language changes — a stored string stays frozen in the language it
 * was created in. The notification components resolve this via `resolveNotificationText`
 * inside a computed, which keeps it reactive to the i18n locale.
 */
export type NotificationText = string | (() => string);

export const resolveNotificationText = (text?: NotificationText): string | undefined =>
    typeof text === "function" ? text() : text;

export type Notification = {
    /**
     * Optional notification ID. If not provided, it will be generated. The ID is needed to remove the notification.
     */
    id?: number | string;
    title?: NotificationText;
    description?: NotificationText;
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
    /**
     * Opt in to surviving a page load. Set it on notifications whose condition
     * outlives the page (e.g. the offline banner) — not on ones tied to the page
     * they were raised on, or whose only affordance is an `actions`/callback the
     * store cannot serialize.
     */
    persist?: boolean;
};

const NOTIFICATIONS_KEY = "notifications";
const DISMISSED_NOTIFICATIONS_KEY = "dismissedNotifications";

// A persisted notification needs `persist: true` plus a caller-assigned string id to
// address it by. Toasts are timed/ephemeral by design, and auto-generated numeric ids
// are re-issued from 0 each session, so persisting them risks a fresh id colliding with
// a stale dismissal from a previous session. Function-typed fields (icon, callback link,
// actions) aren't serializable and getter text can't stay language-reactive through
// JSON, so a restored entry only carries a text snapshot until the notification's own
// origin (e.g. an App.vue watcher) re-adds it with the full content — addNotification
// merges onto the existing id rather than ignoring it.
type PersistedNotification = Pick<
    Notification,
    "id" | "state" | "type" | "closable" | "priority" | "openLink" | "persist"
> & {
    title?: string;
    description?: string;
    link?: RouteLocationNamedRaw;
};

const isPersistable = (n: Notification): n is Notification & { id: string } =>
    n.persist === true && typeof n.id === "string" && n.type !== "toast";

const readPersistedNotifications = (): PersistedNotification[] => {
    try {
        const list = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || "[]");
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
};

const persistNotifications = (notifications: Notification[]) => {
    const persistable: PersistedNotification[] = notifications.filter(isPersistable).map((n) => ({
        id: n.id,
        title: resolveNotificationText(n.title),
        description: resolveNotificationText(n.description),
        state: n.state,
        type: n.type,
        closable: n.closable,
        priority: n.priority,
        openLink: n.openLink,
        link: typeof n.link === "object" ? n.link : undefined,
        persist: true,
    }));
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(persistable));
};

const readDismissedIds = (): Set<string> => {
    try {
        const list = JSON.parse(localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY) || "[]");
        return new Set(Array.isArray(list) ? list.filter((id) => typeof id === "string") : []);
    } catch {
        return new Set();
    }
};

const persistDismissedIds = (dismissedIds: Set<string>) => {
    localStorage.setItem(DISMISSED_NOTIFICATIONS_KEY, JSON.stringify([...dismissedIds]));
};

export const useNotificationStore = defineStore("notification", () => {
    const id = ref(0);
    const dismissedIds = ref<Set<string>>(readDismissedIds());
    const notifications = ref<Notification[]>(
        readPersistedNotifications().filter((n) => !dismissedIds.value.has(n.id as string)),
    );

    const persist = () => persistNotifications(notifications.value);

    const addNotification = (notification: Notification) => {
        // Set default values
        if (notification.closable == undefined) notification.closable = true;
        if (notification.priority == undefined) notification.priority = 10;
        if (notification.openLink == undefined) notification.openLink = false;

        // Do not add a notification the user has already dismissed
        if (typeof notification.id === "string" && dismissedIds.value.has(notification.id)) {
            return notification.id;
        }

        const existingIndex =
            notification.id === undefined
                ? -1
                : notifications.value.findIndex((n) => n.id === notification.id);

        // Merge onto an existing (e.g. reload-restored) entry with the same id instead
        // of ignoring the call, so the restored placeholder picks up the real content.
        if (existingIndex !== -1) {
            notifications.value[existingIndex] = {
                ...notifications.value[existingIndex],
                ...notification,
            };
            notifications.value.sort((a, b) => a.priority! - b.priority!);
            persist();
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
            persist();
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

    // Removes a notification without remembering it as user-dismissed — for callers
    // (e.g. App.vue's condition watchers) clearing a notification because the situation
    // it represented has resolved, so it's free to reappear if the situation recurs.
    const removeNotification = (notificationId: number | string) => {
        notifications.value = notifications.value.filter((n) => n.id !== notificationId);
        persist();
        if (typeof notificationId === "string" && dismissedIds.value.delete(notificationId)) {
            persistDismissedIds(dismissedIds.value);
        }
    };

    // Removes a notification and remembers it as user-dismissed, so it stays gone
    // across reloads even while the situation it represents is still ongoing.
    const dismissNotification = (notificationId: number | string) => {
        const dismissed = notifications.value.find((n) => n.id === notificationId);
        notifications.value = notifications.value.filter((n) => n.id !== notificationId);
        persist();
        // A notification that does not outlive the page has no reason to have its
        // dismissal outlive it either — remembering one would suppress the next,
        // unrelated occurrence on a later page.
        if (typeof notificationId === "string" && dismissed?.persist) {
            dismissedIds.value.add(notificationId);
            persistDismissedIds(dismissedIds.value);
        }
    };

    return {
        notifications,
        banners,
        bottomBanners,
        addNotification,
        removeNotification,
        dismissNotification,
    };
});
