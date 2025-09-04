import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotificationStore } from "@/stores/notification";

// Provide a mock implementation for useI18n context usage.
vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (k: string) => k }),
}));

let checkForUpdate: (showIfSame?: boolean) => Promise<void>;

describe("App updateManager checkForUpdate", () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.resetModules(); // reset module state (updateNotified)
        setActivePinia(createPinia());
        window.localStorage.clear();
        // Dynamically import after resetting modules so updateNotified is fresh
        ({ checkForUpdate } = await import("./updateManager"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stores initial version without notification", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValue({ ok: true, json: () => ({ hash: "hashA" }) }) as any;
        await checkForUpdate();
        vi.runAllTimers();
        expect(localStorage.getItem("app_version")).toBe("hashA");
        expect(useNotificationStore().notifications.length).toBe(0);
    });

    it("creates notification when version changes", async () => {
        localStorage.setItem("app_version", "oldHash");
        global.fetch = vi
            .fn()
            .mockResolvedValue({ ok: true, json: () => ({ hash: "newHash" }) }) as any;
        await checkForUpdate();
        vi.runAllTimers();
        const store = useNotificationStore();
        expect(store.notifications.length).toBe(1);
        expect(store.notifications[0].title).toBe("new_update.available.title");
    });

    it("avoids duplicate notification after first change", async () => {
        localStorage.setItem("app_version", "h1");
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ hash: "h2" }) }) as any;
        await checkForUpdate(); // first change -> notification
        vi.runAllTimers();
        const store = useNotificationStore();
        expect(store.notifications.length).toBe(1);
        global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ hash: "h3" }) }) as any;
        await checkForUpdate(); // second change -> suppressed
        vi.runAllTimers();
        expect(store.notifications.length).toBe(1);
    });
});
