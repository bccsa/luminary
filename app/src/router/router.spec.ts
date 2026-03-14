import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import router from "./index";
import { flushPromises } from "@vue/test-utils";

describe("Router", () => {
    describe("Router Configuration", () => {
        it("should have the correct number of routes", () => {
            expect(router.getRoutes()).toHaveLength(7);
        });

        it("should have home route configured correctly", () => {
            const homeRoute = router.getRoutes().find((route) => route.name === "home");
            expect(homeRoute).toBeDefined();
            expect(homeRoute?.path).toBe("/");
            expect(homeRoute?.meta.title).toBe("title.home");
            expect(homeRoute?.meta.analyticsIgnore).toBe(true);
        });

        it("should have explore route configured correctly", () => {
            const exploreRoute = router.getRoutes().find((route) => route.name === "explore");
            expect(exploreRoute).toBeDefined();
            expect(exploreRoute?.path).toBe("/explore");
            expect(exploreRoute?.meta.title).toBe("title.explore");
        });

        it("should have 404 route as catch-all", () => {
            const notFoundRoute = router.getRoutes().find((route) => route.name === "404");
            expect(notFoundRoute).toBeDefined();
            expect(notFoundRoute?.path).toContain("(.*)");
        });
    });

    describe("Router scroll behavior", () => {
        const scrollBehavior = router.options.scrollBehavior!;

        it("should return savedPosition if available", () => {
            const savedPosition = { top: 100, left: 0 };
            const result = scrollBehavior(
                { path: "/target" } as any,
                { path: "/source" } as any,
                savedPosition,
            );

            expect(result).toBe(savedPosition);
        });

        it("should return top: 0 if no savedPosition", () => {
            const result = scrollBehavior(
                { path: "/target" } as any,
                { path: "/source" } as any,
                null,
            );

            expect(result).toEqual({ top: 0 });
        });
    });

    describe("Navigation Guard", () => {
        // Mock browser history and location
        const originalHistory = window.history;
        const originalLocation = window.location;

        beforeEach(() => {
            // Mock window.history
            Object.defineProperty(window, "history", {
                writable: true,
                value: {
                    length: 2, // Simulate direct navigation
                    replaceState: vi.fn(),
                    pushState: vi.fn(),
                },
            });

            // Mock window.location
            Object.defineProperty(window, "location", {
                writable: true,
                value: {
                    pathname: "/explore",
                    search: "",
                    hash: "",
                },
            });

            // Mock setTimeout to execute immediately
            vi.useFakeTimers();
        });

        afterEach(() => {
            // Restore original browser APIs
            Object.defineProperty(window, "history", {
                writable: true,
                value: originalHistory,
            });

            Object.defineProperty(window, "location", {
                writable: true,
                value: originalLocation,
            });

            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        it("should modify history for direct navigation to non-home routes", async () => {
            // Navigate to a non-home route
            router.push("/explore");
            await flushPromises();

            // Advance timers to trigger setTimeout callback
            vi.runAllTimers();

            // Check if history was modified correctly
            const homeHref = router.resolve({ name: "home" }).href;

            expect(window.history.replaceState).toHaveBeenCalledWith(null, "", homeHref);

            expect(window.history.pushState).toHaveBeenCalledWith(null, "", "/explore");
        });

        it("should not modify history for direct navigation to home route", async () => {
            // Mock location to home path
            Object.defineProperty(window.location, "pathname", {
                value: "/",
                configurable: true,
            });

            // Navigate to home
            router.push("/");
            await flushPromises();

            // Advance timers
            vi.runAllTimers();

            // History methods should not be called
            expect(window.history.replaceState).not.toHaveBeenCalled();
            expect(window.history.pushState).not.toHaveBeenCalled();
        });

        it("should not modify history when not direct navigation", async () => {
            // Change history length to simulate non-direct navigation
            Object.defineProperty(window.history, "length", {
                value: 3,
                configurable: true,
            });

            // Navigate to a non-home route
            router.push("/explore");
            await flushPromises();

            // Advance timers
            vi.runAllTimers();

            // History methods should not be called
            expect(window.history.replaceState).not.toHaveBeenCalled();
            expect(window.history.pushState).not.toHaveBeenCalled();
        });
    });
});
