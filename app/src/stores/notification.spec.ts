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

    describe("persistence across page loads", () => {
        beforeEach(() => {
            localStorage.clear();
        });

        it("restores an active banner from localStorage on store creation", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "offlineBanner",
                title: "You are offline",
                type: "banner",
                state: "warning",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            // Simulate a page load: a fresh Pinia instance re-runs the store setup.
            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            expect(reloadedStore.notifications).toHaveLength(1);
            expect(reloadedStore.notifications[0]).toMatchObject({
                id: "offlineBanner",
                title: "You are offline",
            });
        });

        it("does not restore toasts or notifications without a string id", async () => {
            const store = useNotificationStore();
            store.addNotification({
                title: "Saved",
                type: "toast",
                state: "success",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            expect(reloadedStore.notifications).toHaveLength(0);
        });

        it("keeps a dismissed banner suppressed after a simulated reload", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "offlineBanner",
                title: "You are offline",
                type: "banner",
                state: "warning",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            store.dismissNotification("offlineBanner");
            expect(store.notifications).toHaveLength(0);

            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            // The user dismissed it before reloading, so it must not come back even
            // though the underlying (still-offline) condition would re-add it.
            reloadedStore.addNotification({
                id: "offlineBanner",
                title: "You are offline",
                type: "banner",
                state: "warning",
            });

            expect(reloadedStore.notifications).toHaveLength(0);
        });

        it("forgets the dismissal once removeNotification clears the resolved situation", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "offlineBanner",
                title: "You are offline",
                type: "banner",
                state: "warning",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            store.dismissNotification("offlineBanner");

            // Connection restored: App.vue's watcher calls removeNotification, which
            // should also clear the remembered dismissal for the next occurrence.
            store.removeNotification("offlineBanner");

            store.addNotification({
                id: "offlineBanner",
                title: "You are offline again",
                type: "banner",
                state: "warning",
            });

            await waitForExpect(() => {
                expect(store.notifications).toHaveLength(1);
            });
        });
    });
});
