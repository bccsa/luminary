import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import App from "./App.vue";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { isConnected } from "luminary-shared";
import { useNotificationStore } from "./stores/notification";
import { mockEnglishContentDto } from "./tests/mockdata";
import { theme } from "./globalConfig";
import { createMemoryHistory, createRouter } from "vue-router";
import HomePage from "@/pages/HomePage.vue";
import ExplorePage from "@/pages/ExplorePage.vue";

const routeReplaceMock = vi.fn();
const currentRouteMock = ref({ fullPath: `/${mockEnglishContentDto.slug}` });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("App", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        vi.mock("@auth0/auth0-vue");

        vi.mock("vue-router", async (importOriginal) => {
            const actual = await importOriginal();
            return {
                // @ts-expect-error
                ...actual,
                useRouter: vi.fn().mockImplementation(() => ({
                    currentRoute: currentRouteMock,
                    replace: routeReplaceMock,
                })),
            };
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("Notifications", () => {
        it("shows the 'offline' banner when offline and hides the banner when going online", async () => {
            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isLoading: ref(true),
                isAuthenticated: ref(true),
            });

            const notificationStore = useNotificationStore();
            isConnected.value = false;

            mount(App, {
                shallow: true,
            });

            await wait(4000);

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: "offlineBanner",
                        title: "You are offline",
                        description:
                            "You can still use the app and browse through offline content, but some content (like videos) might not be available.",
                    }),
                );
            });

            isConnected.value = true;

            await waitForExpect(() => {
                expect(notificationStore.removeNotification).toHaveBeenCalledWith("offlineBanner");
            });
        }, 9000);

        it("shows the banner when not authenticated", async () => {
            vi.spyOn(isConnected, "value", "get").mockReturnValue(true);

            (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
                isLoading: ref(false),
                isAuthenticated: ref(false),
            });

            const notificationStore = useNotificationStore();

            mount(App, {
                shallow: true,
            });

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: "accountBanner",
                        title: "You are missing out!",
                        description: "Click here to create an account or log in.",
                    }),
                );
            }, 8000);
        }, 9000);
    });

    describe("Theme config", () => {
        it("applies the correct theme class on mount - dark mode", () => {
            theme.value = "dark";

            mount(App, {
                shallow: true,
            });

            expect(document.documentElement.classList.contains("dark")).toBe(true);
        });

        it("applies the correct theme class on mount - light mode", () => {
            theme.value = "light";

            mount(App, {
                shallow: true,
            });

            expect(document.documentElement.classList.contains("dark")).toBe(false);
        });
    });

    describe("Router", () => {
        it("redirects to home when accessed externally", async () => {

            const routes = [
            { path: "/", name: "home", component: HomePage },
            { path: "/explore", name: "explore", component: ExplorePage },
            ];

            const testRouter = createRouter({
                history: createMemoryHistory(),
                routes,
            });

            testRouter.beforeEach(async (to, from, next) => {
                if (!from.name && to.name !== "home") {
                    await testRouter.replace({ name: "home" });
                    await testRouter.push(to.fullPath);
                    next(false);
                    return;
                }
                next();
            });

            // Spy on replace and push
            const replaceSpy = vi.spyOn(testRouter, "replace");
            const pushSpy = vi.spyOn(testRouter, "push");

            //Simulate external entry
            await testRouter.push("/explore");
            await testRouter.isReady();

           await waitForExpect(() => {
            expect(replaceSpy).toHaveBeenCalledWith({ name: "home" });
            expect(pushSpy).toHaveBeenCalledWith("/explore");
           });
        });
    });
});
