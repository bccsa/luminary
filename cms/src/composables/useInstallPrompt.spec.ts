import { describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "./useInstallPrompt";

const withNavigator = async (overrides: Partial<Navigator>) => {
    const originalUserAgent = navigator.userAgent;
    const originalPlatform = navigator.platform;
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    Object.defineProperties(navigator, {
        userAgent: { configurable: true, value: overrides.userAgent },
        platform: { configurable: true, value: overrides.platform },
        maxTouchPoints: { configurable: true, value: overrides.maxTouchPoints },
    });

    vi.resetModules();
    const { useInstallPrompt: freshUseInstallPrompt } = await import("./useInstallPrompt");
    const result = freshUseInstallPrompt();
    void result.manualInstallInstructions.value;

    Object.defineProperties(navigator, {
        userAgent: { configurable: true, value: originalUserAgent },
        platform: { configurable: true, value: originalPlatform },
        maxTouchPoints: { configurable: true, value: originalMaxTouchPoints },
    });

    return result;
};

const dispatchBeforeInstallPrompt = (prompt = vi.fn().mockResolvedValue(undefined)) => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
        prompt,
        userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    window.dispatchEvent(event);
    return prompt;
};

describe("useInstallPrompt", () => {
    it("captures the install prompt and triggers it on request", async () => {
        const { isInstallable, promptInstall } = useInstallPrompt();
        const prompt = dispatchBeforeInstallPrompt();

        expect(isInstallable.value).toBe(true);

        await promptInstall();

        expect(prompt).toHaveBeenCalled();
        expect(isInstallable.value).toBe(false);
    });

    it("clears the install prompt when prompting fails", async () => {
        const { isInstallable, promptInstall } = useInstallPrompt();
        dispatchBeforeInstallPrompt(vi.fn().mockRejectedValue(new Error("blocked")));

        await expect(promptInstall()).rejects.toThrow("blocked");

        expect(isInstallable.value).toBe(false);
    });

    it("provides manual installation instructions on iOS browsers", async () => {
        const { manualInstallInstructions } = await withNavigator({
            userAgent:
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1",
            platform: "iPhone",
            maxTouchPoints: 0,
        });

        expect(manualInstallInstructions.value).toBe(
            "To install, tap Share, then Add to Home Screen.",
        );
    });

    it("provides manual installation instructions on desktop Safari", async () => {
        const { manualInstallInstructions } = await withNavigator({
            userAgent:
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            platform: "MacIntel",
            maxTouchPoints: 0,
        });

        expect(manualInstallInstructions.value).toBe(
            "To install, click the Share icon in Safari's toolbar, then choose Add to Dock.",
        );
    });

    it("tracks app installation", () => {
        const { isInstallable, isInstalled } = useInstallPrompt();
        dispatchBeforeInstallPrompt();

        window.dispatchEvent(new Event("appinstalled"));

        expect(isInstalled.value).toBe(true);
        expect(isInstallable.value).toBe(false);
    });
});
