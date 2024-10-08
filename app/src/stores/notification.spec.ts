import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotificationStore } from "./notification";
import waitForExpect from "wait-for-expect";

describe("notification store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can add a notification", async () => {
        const store = useNotificationStore();

        store.addNotification({
            title: "Test",
            type: "toast",
            state: "success",
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(1);
        });
    });

    it("automatically deletes the notification", async () => {
        const store = useNotificationStore();

        store.addNotification({
            title: "New",
            type: "toast",
            state: "info",
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(1);
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(0);
        }, 5000);
    });

    it("can remove a notification", async () => {
        const store = useNotificationStore();

        store.addNotification({
            title: "Test",
            type: "banner",
            state: "success",
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(1);
        });

        const notificationId = store.notifications[0].id;

        store.removeNotification(notificationId!);

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(0);
        });
    });
});
