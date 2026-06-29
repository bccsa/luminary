import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mockProbe = (bytes: number, seconds: number) => {
    vi.spyOn(performance, "now")
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1000 + seconds * 1000)
        .mockReturnValueOnce(1000 + seconds * 1000);
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)) }),
    );
};

const loadSubject = async () => {
    vi.resetModules();
    const userDataSaverEnabled = ref(false);
    const isDataSaverEnabled = vi.fn(() => false);
    vi.doMock("@/globalConfig", () => ({ isDataSaverEnabled, userDataSaverEnabled }));
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });

    const subject = await import("./useNetworkSpeedEstimator");
    subject.connectionSpeed.value = 10;
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    return { ...subject, isDataSaverEnabled, userDataSaverEnabled };
};

describe("useNetworkSpeedEstimator", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.doUnmock("@/globalConfig");
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it("estimates speed from the probe download and persists it", async () => {
        const { connectionSpeed, isSlowConnection, runProbe } = await loadSubject();
        mockProbe(100_000, 0.1);

        await runProbe(true);

        expect(connectionSpeed.value).toBeCloseTo(8, 3);
        expect(isSlowConnection.value).toBe(false);
        expect(Number(localStorage.getItem("connectionSpeedMbps"))).toBeCloseTo(8, 3);
    });

    it("flags a slow connection below the threshold", async () => {
        const { connectionSpeed, isSlowConnection, runProbe } = await loadSubject();
        mockProbe(100_000, 0.5);

        await runProbe(true);

        expect(connectionSpeed.value).toBeCloseTo(1.6, 3);
        expect(isSlowConnection.value).toBe(true);
    });

    it("does not probe while offline", async () => {
        const { connectionSpeed, runProbe } = await loadSubject();
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await runProbe(true);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(connectionSpeed.value).toBe(10);
    });

    it("does not spend data probing when the user's Data Saver toggle is on", async () => {
        const { connectionSpeed, runProbe, userDataSaverEnabled } = await loadSubject();
        userDataSaverEnabled.value = true;
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await runProbe(true);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(connectionSpeed.value).toBe(10);
    });
});
