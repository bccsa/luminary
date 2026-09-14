import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { resolveNotificationText, useNotificationStore } from "./notification";
import { SignalSlashIcon } from "@heroicons/vue/24/outline";
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
                persist: true,
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

        it("restores a banner whose text is a translation getter", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "offlineBanner",
                title: () => "You are offline",
                description: () => "Some content may be unavailable.",
                type: "banner",
                state: "warning",
                icon: SignalSlashIcon,
                priority: 1,
                persist: true,
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            // The getter cannot survive JSON, so the restored entry carries a snapshot
            // of the text it was showing.
            expect(reloadedStore.notifications).toHaveLength(1);
            expect(reloadedStore.notifications[0]).toMatchObject({
                id: "offlineBanner",
                title: "You are offline",
                description: "Some content may be unavailable.",
                state: "warning",
                priority: 1,
            });
        });

        it("merges the live content onto a restored entry when the origin re-adds it", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "offlineBanner",
                title: () => "You are offline",
                type: "banner",
                state: "warning",
                icon: SignalSlashIcon,
                persist: true,
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            // Nothing serializable carries the icon or the getter across the reload...
            expect(reloadedStore.notifications[0].icon).toBeUndefined();

            reloadedStore.addNotification({
                id: "offlineBanner",
                title: () => "Vous êtes hors ligne",
                type: "banner",
                state: "warning",
                icon: SignalSlashIcon,
                persist: true,
            });

            // ...so the origin re-adding it has to merge onto the restored entry rather
            // than being ignored as a duplicate id.
            expect(reloadedStore.notifications).toHaveLength(1);
            expect(reloadedStore.notifications[0].icon).toBe(SignalSlashIcon);
            expect(resolveNotificationText(reloadedStore.notifications[0].title)).toBe(
                "Vous êtes hors ligne",
            );
        });

        it("does not restore a banner that did not opt in", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "content-available",
                title: "A translation is available",
                type: "banner",
                state: "info",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            setActivePinia(createPinia());
            expect(useNotificationStore().notifications).toHaveLength(0);
        });

        it("does not remember the dismissal of a banner that did not opt in", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "content-available",
                title: "A translation is available",
                type: "banner",
                state: "info",
            });

            await waitForExpect(() => {
                expect(store.notifications.length).toBe(1);
            });

            store.dismissNotification("content-available");

            setActivePinia(createPinia());
            const reloadedStore = useNotificationStore();

            // Dismissing a page-scoped banner must not suppress the next, unrelated
            // occurrence on a later page.
            reloadedStore.addNotification({
                id: "content-available",
                title: "A translation is available",
                type: "banner",
                state: "info",
            });

            await waitForExpect(() => {
                expect(reloadedStore.notifications).toHaveLength(1);
            });
        });

        it("does not restore toasts or notifications without a string id", async () => {
            const store = useNotificationStore();
            store.addNotification({
                id: "saved",
                title: "Saved",
                type: "toast",
                state: "success",
                persist: true,
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
                persist: true,
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
                persist: true,
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
                persist: true,
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
                persist: true,
            });

            await waitForExpect(() => {
                expect(store.notifications).toHaveLength(1);
            });
        });
    });
});
