import { afterEach, describe, expect, it, vi } from "vitest";

async function loadSubject() {
    vi.resetModules();
    return import("./usePwaUpdate");
}

describe("usePwaUpdate", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        (import.meta.env as { SSR: boolean }).SSR = false;
    });

    it("does not poll for updates during the SSG prerender", async () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        (import.meta.env as { SSR: boolean }).SSR = true;

        await loadSubject();

        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it("polls for updates on the client", async () => {
        const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
        (import.meta.env as { SSR: boolean }).SSR = false;

        await loadSubject();

        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });
});
