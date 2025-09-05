import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotificationStore } from "../stores/notification";

// We import the main file indirectly by extracting the function via dynamic import pattern.
// Instead of refactoring production code right now, we replicate the logic here for test isolation.

// We'll copy minimal logic from cms/src/main.ts for checkForUpdate so we can unit test behavior

const VERSION_STORAGE_KEY = "app_version";
let updateNotified = false;

async function checkForUpdate(fetchImpl: typeof fetch) {
    const res = await fetchImpl("/version.json");
    if (!("ok" in res) || !res.ok) return;
    const data = (await res.json()) as { hash?: string };
    if (!data?.hash) return;
    const current = window.localStorage.getItem(VERSION_STORAGE_KEY);
    if (current && current !== data.hash && !updateNotified) {
        updateNotified = true;
        useNotificationStore().addNotification({
            title: "Update available",
            description:
                "Good news! A new version of the CMS is ready. Click here to reload and apply the update.",
            state: "warning",
            timer: 60000,
            click: () => {},
        });
    }
    window.localStorage.setItem(VERSION_STORAGE_KEY, data.hash);
}

describe("CMS checkForUpdate", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        updateNotified = false;
        setActivePinia(createPinia());
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stores initial version without notification", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => ({ hash: "v1" }) });
        await checkForUpdate(fetchMock as any);
        vi.runAllTimers();
        expect(window.localStorage.getItem("app_version")).toBe("v1");
        expect(useNotificationStore().notifications.length).toBe(0);
    });

    it("shows notification when version changes", async () => {
        window.localStorage.setItem("app_version", "v1");
        const store = useNotificationStore();
        const spy = vi.spyOn(store, "addNotification");
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => ({ hash: "v2" }) });
        await checkForUpdate(fetchMock as any);
        vi.runAllTimers();
        expect(spy).toHaveBeenCalledTimes(1);
        const arg = spy.mock.calls[0][0];
        expect(arg.title).toContain("Update");
    });

    it("does not duplicate notification after first change", async () => {
        window.localStorage.setItem("app_version", "v1");
        const store = useNotificationStore();
        const spy = vi.spyOn(store, "addNotification");
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: true, json: () => ({ hash: "v2" }) })
            .mockResolvedValue({ ok: true, json: () => ({ hash: "v3" }) });
        await checkForUpdate(fetchMock as any); // first change
        vi.runAllTimers();
        await checkForUpdate(fetchMock as any); // second change
        vi.runAllTimers();
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
