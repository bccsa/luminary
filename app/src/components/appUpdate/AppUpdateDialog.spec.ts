import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import AppUpdateDialog from "./AppUpdateDialog.vue";
import LDialog from "@/components/common/LDialog.vue";
import { AppUpdateKey } from "@/build-time/contracts/app-update/token";
import { userPreferencesAsRef } from "@/globalConfig";
import { mockLanguageDtoEng } from "@/tests/mockdata";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => (mockLanguageDtoEng.translations as Record<string, string>)[key] || key,
    }),
}));

vi.mock("@/globalConfig", async () => {
    const { ref } = await import("vue");
    return {
        isTestEnviroment: true,
        userPreferencesAsRef: ref<{ privacyPolicy?: { status: string; ts: number } }>({}),
    };
});

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1);

function mountDialog(installed = "1.9.4", store = "2.0.0") {
    const service = {
        installedVersion: ref<string | undefined>(installed),
        storeVersion: ref<string | undefined>(store),
        storeCheckedAt: ref<number | undefined>(Date.now()),
        openStore: vi.fn(),
    };
    const wrapper = mount(AppUpdateDialog, {
        global: { provide: { [AppUpdateKey as symbol]: service } },
    });
    return { wrapper, service, dialog: () => wrapper.findComponent(LDialog) };
}

/** Opens the app again at `time`, the way a later launch would. */
async function launchAt(time: number, installed?: string, store?: string) {
    vi.setSystemTime(time);
    const mounted = mountDialog(installed, store);
    await nextTick();
    return mounted;
}

describe("AppUpdateDialog", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        localStorage.clear();
        userPreferencesAsRef.value = { privacyPolicy: { status: "accepted", ts: 0 } } as never;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("waits three days after the update is first seen", async () => {
        const first = await launchAt(T0);
        expect(first.dialog().props("open")).toBe(false);
        first.wrapper.unmount();

        const early = await launchAt(T0 + 2 * DAY_MS);
        expect(early.dialog().props("open")).toBe(false);
        early.wrapper.unmount();

        const due = await launchAt(T0 + 3 * DAY_MS);
        expect(due.dialog().props("open")).toBe(true);
    });

    it("reminds again after three days, then after seven days, then stops", async () => {
        (await launchAt(T0)).wrapper.unmount();

        const reminders = [3, 6, 13].map((day) => T0 + day * DAY_MS);
        for (const time of reminders) {
            const { wrapper, dialog } = await launchAt(time);
            expect(dialog().props("open")).toBe(true);
            (dialog().props("secondaryAction") as () => void)();
            wrapper.unmount();
        }

        const between = await launchAt(T0 + 12 * DAY_MS);
        expect(between.dialog().props("open")).toBe(false);
        between.wrapper.unmount();

        const afterLast = await launchAt(T0 + 60 * DAY_MS);
        expect(afterLast.dialog().props("open")).toBe(false);
    });

    it("reconsiders the reminder after each store check while the app stays open", async () => {
        (await launchAt(T0)).wrapper.unmount();
        const { dialog, service } = await launchAt(T0 + 2 * DAY_MS);
        expect(dialog().props("open")).toBe(false);

        // The app returns to the foreground a day later and checks the store again.
        vi.setSystemTime(T0 + 3 * DAY_MS);
        service.storeCheckedAt.value = T0 + 3 * DAY_MS;
        await nextTick();

        expect(dialog().props("open")).toBe(true);
    });

    it("opens the store and closes when Update is chosen", async () => {
        (await launchAt(T0)).wrapper.unmount();
        const { dialog, service } = await launchAt(T0 + 3 * DAY_MS);

        (dialog().props("primaryAction") as () => void)();
        await nextTick();

        expect(service.openStore).toHaveBeenCalledOnce();
        expect(dialog().props("open")).toBe(false);
    });

    it("closes without opening the store when Later is chosen", async () => {
        (await launchAt(T0)).wrapper.unmount();
        const { dialog, service } = await launchAt(T0 + 3 * DAY_MS);

        (dialog().props("secondaryAction") as () => void)();
        await nextTick();

        expect(service.openStore).not.toHaveBeenCalled();
        expect(dialog().props("open")).toBe(false);
    });

    it("waits until the privacy notice has been answered", async () => {
        userPreferencesAsRef.value = {} as never;
        (await launchAt(T0)).wrapper.unmount();

        const unanswered = await launchAt(T0 + 3 * DAY_MS);
        expect(unanswered.dialog().props("open")).toBe(false);
        unanswered.wrapper.unmount();

        userPreferencesAsRef.value = { privacyPolicy: { status: "necessaryOnly", ts: 0 } } as never;
        const answered = await launchAt(T0 + 3 * DAY_MS + 1);
        expect(answered.dialog().props("open")).toBe(true);
    });

    it("stays closed when the app is up to date", async () => {
        (await launchAt(T0, "2.0.0", "2.0.0")).wrapper.unmount();

        const later = await launchAt(T0 + 30 * DAY_MS, "2.0.0", "2.0.0");
        expect(later.dialog().props("open")).toBe(false);
    });

    it("starts the reminders again for a newer store version", async () => {
        (await launchAt(T0)).wrapper.unmount();
        for (const day of [3, 6, 13]) {
            const { wrapper, dialog } = await launchAt(T0 + day * DAY_MS);
            (dialog().props("secondaryAction") as () => void)();
            wrapper.unmount();
        }

        const newRelease = await launchAt(T0 + 20 * DAY_MS, "1.9.4", "2.1.0");
        expect(newRelease.dialog().props("open")).toBe(false);
        newRelease.wrapper.unmount();

        const due = await launchAt(T0 + 23 * DAY_MS, "1.9.4", "2.1.0");
        expect(due.dialog().props("open")).toBe(true);
    });
});
