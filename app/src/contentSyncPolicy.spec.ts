import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("luminary-shared", () => ({
    purgeSyncedContent: vi.fn(),
    setContentSyncPolicy: vi.fn(),
}));

vi.mock("./globalConfig", () => ({
    isInstalledStandalone: vi.fn(() => false),
}));

const {
    applyContentSyncPolicy,
    contentSyncMode,
    resolveContentSyncMode,
    BROWSER_CONTENT_SYNC_WINDOW_MS,
} = await import("./contentSyncPolicy");
const { purgeSyncedContent, setContentSyncPolicy } = await import("luminary-shared");
const { isInstalledStandalone } = await import("./globalConfig");

describe("contentSyncPolicy", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isInstalledStandalone).mockReturnValue(false);
    });

    afterEach(() => {
        delete (window as any).Capacitor;
        vi.useRealTimers();
    });

    describe("resolveContentSyncMode", () => {
        it.each([
            { standalone: true, authenticated: false, expected: "full" },
            { standalone: true, authenticated: true, expected: "full" },
            { standalone: false, authenticated: true, expected: "window" },
            { standalone: false, authenticated: false, expected: "none" },
        ])(
            "standalone=$standalone authenticated=$authenticated → $expected",
            ({ standalone, authenticated, expected }) => {
                vi.mocked(isInstalledStandalone).mockReturnValue(standalone);
                expect(resolveContentSyncMode(authenticated)).toBe(expected);
            },
        );

        it("treats the Capacitor native shell as installed", () => {
            (window as any).Capacitor = { isNativePlatform: () => true };
            expect(resolveContentSyncMode(false)).toBe("full");
        });
    });

    describe("applyContentSyncPolicy", () => {
        it("full: enables sync with no cutoff and keeps local content", async () => {
            vi.mocked(isInstalledStandalone).mockReturnValue(true);

            expect(await applyContentSyncPolicy(false)).toBe("full");

            expect(setContentSyncPolicy).toHaveBeenCalledWith({
                enabled: true,
                publishDateCutoff: undefined,
            });
            expect(purgeSyncedContent).not.toHaveBeenCalled();
            expect(contentSyncMode()).toBe("full");
        });

        it("window: enables sync with a rolling one-month cutoff", async () => {
            vi.useFakeTimers({ now: 10 * BROWSER_CONTENT_SYNC_WINDOW_MS });

            expect(await applyContentSyncPolicy(true)).toBe("window");

            expect(setContentSyncPolicy).toHaveBeenCalledWith({
                enabled: true,
                publishDateCutoff: 9 * BROWSER_CONTENT_SYNC_WINDOW_MS,
            });
            expect(purgeSyncedContent).not.toHaveBeenCalled();
        });

        it("none: disables sync and purges previously synced content", async () => {
            expect(await applyContentSyncPolicy(false)).toBe("none");

            expect(setContentSyncPolicy).toHaveBeenCalledWith({
                enabled: false,
                publishDateCutoff: undefined,
            });
            expect(purgeSyncedContent).toHaveBeenCalledTimes(1);
            expect(contentSyncMode()).toBe("none");
        });
    });
});
