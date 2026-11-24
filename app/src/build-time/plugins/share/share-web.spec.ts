import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebShareService } from "./share-web";

const payload = { title: "Title", text: "Message", url: "https://example.org/post" };

const setNativeShare = (share: unknown) =>
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

const setCoarsePointer = (coarse: boolean) =>
    vi
        .spyOn(window, "matchMedia")
        .mockImplementation(
            (query) => ({ matches: coarse && query === "(pointer: coarse)" }) as MediaQueryList,
        );

describe("WebShareService", () => {
    beforeEach(() => {
        setCoarsePointer(true);
    });

    afterEach(() => {
        // @ts-expect-error jsdom has no navigator.share to restore
        delete navigator.share;
        // @ts-expect-error jsdom has no navigator.canShare to restore
        delete navigator.canShare;
        vi.restoreAllMocks();
    });

    it("opens the share sheet on a touch device", async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        setNativeShare(share);
        const service = new WebShareService();

        expect(service.isAvailable()).toBe(true);
        await expect(service.share(payload)).resolves.toBe("shared");
        expect(share).toHaveBeenCalledWith(payload);
    });

    it("is unavailable on desktop even when the browser has a share sheet", async () => {
        const share = vi.fn();
        setNativeShare(share);
        setCoarsePointer(false);
        const service = new WebShareService();

        expect(service.isAvailable()).toBe(false);
        await expect(service.share(payload)).resolves.toBe("unavailable");
        expect(share).not.toHaveBeenCalled();
    });

    it("is unavailable where the browser has no share sheet", () => {
        expect(new WebShareService().isAvailable()).toBe(false);
    });

    it("reports a dismissed sheet as dismissed", async () => {
        setNativeShare(vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));

        await expect(new WebShareService().share(payload)).resolves.toBe("dismissed");
    });

    it("treats a tap while the sheet is already open as dismissed and keeps offering it", async () => {
        setNativeShare(
            vi.fn().mockRejectedValue(new DOMException("in progress", "InvalidStateError")),
        );
        const service = new WebShareService();

        await expect(service.share(payload)).resolves.toBe("dismissed");
        expect(service.isAvailable()).toBe(true);
    });

    it("keeps offering the sheet after a payload it could not carry", async () => {
        setNativeShare(vi.fn().mockRejectedValue(new TypeError("bad payload")));
        const service = new WebShareService();

        await expect(service.share(payload)).resolves.toBe("unavailable");
        expect(service.isAvailable()).toBe(true);
    });

    it("stops offering a share sheet that is blocked", async () => {
        setNativeShare(vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError")));
        const service = new WebShareService();

        await expect(service.share(payload)).resolves.toBe("unavailable");
        expect(service.isAvailable()).toBe(false);
    });

    it("asks the browser whether it can carry files", () => {
        const file = new File(["x"], "image.webp", { type: "image/webp" });
        expect(new WebShareService().canShareFiles([file])).toBe(false);

        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
        expect(new WebShareService().canShareFiles([file])).toBe(true);
    });
});
