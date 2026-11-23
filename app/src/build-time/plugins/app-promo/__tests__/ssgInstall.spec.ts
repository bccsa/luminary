import { describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

const order = vi.hoisted(() => [] as string[]);

vi.mock("virtual:app-promo", () => {
    order.push("load");
    return {
        installAppPromo: vi.fn(() => {
            order.push("install");
        }),
    };
});
vi.mock("luminary-shared", () => ({
    getSocket: vi.fn(() => ({ connect: vi.fn() })),
    init: vi.fn(),
    warmMangoCaches: vi.fn(),
}));
vi.mock("@/globalConfig", () => ({
    apiUrl: "",
    appLanguageIdsAsRef: { value: [] },
    initLanguage: vi.fn(),
}));
vi.mock("@/docsIndex", () => ({ APP_DOCS_INDEX: "" }));
vi.mock("@/sync", () => ({ initAuthLangSync: vi.fn(), initSync: vi.fn() }));

const { installSsgAppPromo, initSsgClient } = await import("@/ssg/clientRuntime");
const promo = () => import("virtual:app-promo");

describe("installSsgAppPromo", () => {
    it("leaves the promotion module out of the client runtime, so the data layer boots without it", async () => {
        await initSsgClient();
        expect(order).toEqual([]);
    });

    it("loads and installs the promotion plugin only after the hydrating mount", async () => {
        const app = createApp(defineComponent({ setup: () => () => h("div") }));
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: "/", component: { render: () => null } }],
        });

        // As vite-ssg orders it: the setup callback runs, then the router installs, then the mount waits for it.
        installSsgAppPromo(app, router);
        app.use(router);
        await router.push("/");
        await router.isReady();
        order.push("mount");
        app.mount(document.createElement("div"));
        expect(order).toEqual(["mount"]);

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(order).toEqual(["mount", "load", "install"]);
        expect((await promo()).installAppPromo).toHaveBeenCalledWith(app);
        app.unmount();
    });

    it("logs an installation failure instead of rejecting", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked((await promo()).installAppPromo).mockRejectedValueOnce(new Error("no promo"));
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [{ path: "/", component: { render: () => null } }],
        });

        installSsgAppPromo(createApp({}), router);
        await router.push("/");
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "no promo" }));
        error.mockRestore();
    });
});
