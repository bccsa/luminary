import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { CHUNK_RELOAD_KEY, installChunkReload } from "./chunkReload";

const Page = { template: "<div />" };

function fakeWindow() {
    const target = new EventTarget();
    const win = {
        addEventListener: target.addEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        sessionStorage: window.sessionStorage,
        location: { assign: vi.fn(), reload: vi.fn() },
    };
    return win as unknown as Window & typeof win;
}

function preloadError(win: Window) {
    const event = new Event("vite:preloadError", { cancelable: true });
    win.dispatchEvent(event);
    return event;
}

describe("installChunkReload", () => {
    let router: Router;
    let win: ReturnType<typeof fakeWindow>;

    beforeEach(async () => {
        sessionStorage.clear();
        win = fakeWindow();
        router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: "/", component: Page },
                {
                    path: "/explore",
                    // Mimics Vite's preload helper: the event fires before the import rejects.
                    component: () => {
                        preloadError(win);
                        return Promise.reject(new Error("chunk missing"));
                    },
                },
            ],
        });
        installChunkReload(router, "build-1", win);
        await router.push("/");
    });

    it("reloads the current page when a chunk fails outside a navigation", () => {
        const event = preloadError(win);

        expect(event.defaultPrevented).toBe(true);
        expect(win.location.reload).toHaveBeenCalledOnce();
        expect(win.location.assign).not.toHaveBeenCalled();
    });

    it("loads the clicked route when its chunk fails, not the previous page", async () => {
        await router.push("/explore").catch(() => {});

        expect(win.location.assign).toHaveBeenCalledWith("/explore");
        expect(win.location.reload).not.toHaveBeenCalled();
        expect(router.currentRoute.value.path).toBe("/");
    });

    it("reloads only once per build so a missing chunk can't loop", () => {
        preloadError(win);
        const second = preloadError(win);

        expect(second.defaultPrevented).toBe(false);
        expect(win.location.reload).toHaveBeenCalledOnce();
    });

    it("reloads again after a later deploy", () => {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "build-0");

        preloadError(win);

        expect(win.location.reload).toHaveBeenCalledOnce();
        expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe("build-1");
    });
});
