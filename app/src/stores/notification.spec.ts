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
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(1);
        });
    });

    it("automatically deletes the previous notification", async () => {
        const store = useNotificationStore();
        store.notifications = [{ title: "Previous" }];

        store.addNotification({
            title: "New",
        });

        await waitForExpect(() => {
            expect(store.notifications.length).toBe(1);
            expect(store.notifications[0].title).toBe("New");
        });
    });
});
