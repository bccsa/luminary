import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userDataSaverEnabled } from "@/globalConfig";
import { connectionSpeed, isSlowConnection, runProbe } from "./useNetworkSpeed";

// Mock a probe download of `bytes` bytes that "takes" `seconds` seconds, by feeding `performance.now`
// the exact sequence runProbe reads it in: now → start → end → lastProbeAt.
const mockProbe = (bytes: number, seconds: number) => {
    vi.spyOn(performance, "now")
        .mockReturnValueOnce(0) // now (throttle/url)
        .mockReturnValueOnce(1000) // start
        .mockReturnValueOnce(1000 + seconds * 1000) // end → elapsed = seconds
        .mockReturnValueOnce(1000 + seconds * 1000); // lastProbeAt
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(bytes)) }),
    );
};

describe("useNetworkSpeed", () => {
    beforeEach(() => {
        connectionSpeed.value = 10;
        userDataSaverEnabled.value = false;
        // jsdom defaults navigator.onLine to true; make it explicit & resettable.
        Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    it("estimates speed from the probe download and persists it", async () => {
        mockProbe(100_000, 0.1); // 100kB in 0.1s → 8 Mbps
        await runProbe(true);

        expect(connectionSpeed.value).toBeCloseTo(8, 3);
        expect(isSlowConnection.value).toBe(false); // 8 >= 4
        expect(Number(localStorage.getItem("connectionSpeedMbps"))).toBeCloseTo(8, 3);
    });

    it("flags a slow connection below the threshold", async () => {
        mockProbe(100_000, 0.5); // 100kB in 0.5s → 1.6 Mbps (slow 4G / 3G territory)
        await runProbe(true);

        expect(connectionSpeed.value).toBeCloseTo(1.6, 3);
        expect(isSlowConnection.value).toBe(true); // 1.6 < 4
    });

    it("does not probe while offline", async () => {
        Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await runProbe(true);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(connectionSpeed.value).toBe(10); // unchanged
    });

    it("does not spend data probing when the user's Data Saver toggle is on", async () => {
        userDataSaverEnabled.value = true;
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await runProbe(true);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(connectionSpeed.value).toBe(10);
    });
});
