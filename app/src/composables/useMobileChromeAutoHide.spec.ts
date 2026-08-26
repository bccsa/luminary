import { describe, it, expect, beforeEach } from "vitest";
import { useMobileChromeAutoHide } from "./useMobileChromeAutoHide";

describe("useMobileChromeAutoHide", () => {
    const chrome = useMobileChromeAutoHide();

    beforeEach(() => chrome.reset());

    it("stays visible near the top of the page", () => {
        chrome.onScroll(40);
        chrome.onScroll(70);
        expect(chrome.hidden.value).toBe(false);
    });

    it("hides after scrolling down and shows again on scrolling up", () => {
        chrome.onScroll(100);
        chrome.onScroll(140);
        expect(chrome.hidden.value).toBe(true);

        chrome.onScroll(120);
        expect(chrome.hidden.value).toBe(false);
    });

    it("ignores small jitter in either direction", () => {
        chrome.onScroll(100);
        chrome.onScroll(140);
        expect(chrome.hidden.value).toBe(true);

        chrome.onScroll(135);
        expect(chrome.hidden.value).toBe(true);
    });

    it("comes back when returning to the top regardless of direction history", () => {
        chrome.onScroll(300);
        chrome.onScroll(400);
        expect(chrome.hidden.value).toBe(true);
        chrome.onScroll(0);
        expect(chrome.hidden.value).toBe(false);
    });

    it("comes back when the end of the page is reached while scrolling down", () => {
        chrome.onScroll(300, 2000);
        chrome.onScroll(400, 1900);
        expect(chrome.hidden.value).toBe(true);
        chrome.onScroll(2250, 50);
        expect(chrome.hidden.value).toBe(false);
    });

    it("is shared between callers and cleared by reset", () => {
        chrome.onScroll(200);
        chrome.onScroll(300);
        expect(useMobileChromeAutoHide().hidden.value).toBe(true);
        chrome.reset();
        expect(useMobileChromeAutoHide().hidden.value).toBe(false);
    });
});
