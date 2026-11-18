import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const KEY = "desktop-sidebar-collapsed";

// The collapsed state is module-level, so each test loads a fresh copy of the module.
async function load() {
    vi.resetModules();
    return (await import("./useDesktopSidebar")).useDesktopSidebar();
}

describe("useDesktopSidebar", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it("keeps the collapsed state for the session only", async () => {
        const { toggleCollapsed } = await load();

        toggleCollapsed();
        await nextTick();

        expect(sessionStorage.getItem(KEY)).toBe("true");
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("restores the collapsed state after a refresh", async () => {
        sessionStorage.setItem(KEY, "true");

        const { collapsed } = await load();

        expect(collapsed.value).toBe(true);
    });

    it("ignores and removes a collapsed state stored permanently before", async () => {
        localStorage.setItem(KEY, "true");

        const { collapsed } = await load();

        expect(collapsed.value).toBe(false);
        expect(localStorage.getItem(KEY)).toBeNull();
    });
});
