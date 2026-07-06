import { describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "./useInstallPrompt";

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

    it("tracks app installation", () => {
        const { isInstallable, isInstalled } = useInstallPrompt();
        dispatchBeforeInstallPrompt();

        window.dispatchEvent(new Event("appinstalled"));

        expect(isInstalled.value).toBe(true);
        expect(isInstallable.value).toBe(false);
    });
});
