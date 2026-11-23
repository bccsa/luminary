import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, inject } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import {
    DownloadsKey,
    providedDownloads,
    useDownloads,
} from "@/build-time/contracts/downloads/token";
import { installDownloads } from "@/build-time/plugins/downloads/index";
import { provideDownloads, provideFakeDownloads } from "@/build-time/plugins/downloads/provide";
import { createFakeEngine } from "../fakeEngine";
import { makeDeps } from "./helpers";

const panel = () => document.querySelector("[data-test='fake-downloads-panel']");

const testRouter = () =>
    createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: "/", component: { template: "<div />" } },
            { path: "/:slug", name: "content", component: { template: "<div />" } },
        ],
    });

afterEach(() => {
    window.history.replaceState(null, "", "/");
});

describe("installDownloads", () => {
    it("provides nothing, so consumers show no downloads UI", async () => {
        const app = createApp({});
        installDownloads(app);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(app.runWithContext(() => inject(DownloadsKey, undefined))).toBeUndefined();
        expect(panel()).toBeNull();
    });

    it("installs the fake engine in development with ?fakeDownloads", async () => {
        window.history.replaceState(null, "", "/?fakeDownloads");
        const app = createApp({});
        installDownloads(app);
        await vi.waitFor(() =>
            expect(app.runWithContext(() => inject(DownloadsKey, undefined))).toBeDefined(),
        );
        expect(panel()).not.toBeNull();
        const service = app.runWithContext(() => inject(DownloadsKey, undefined));
        (service as unknown as { dispose(): void }).dispose();
        panel()?.parentElement?.remove();
    });
});

describe("provideFakeDownloads", () => {
    it("provides downloads over the fake engine, with the route and the panel", async () => {
        const app = createApp({});
        const router = testRouter();
        const { deps } = makeDeps();
        const fake = await provideFakeDownloads(app, { router, deps });
        try {
            expect(app.runWithContext(() => inject(DownloadsKey, undefined))).toBe(fake.service);
            expect(router.resolve("/downloads").name).toBe("downloads");
            expect(panel()).not.toBeNull();
        } finally {
            fake.dispose();
        }
        expect(panel()).toBeNull();
    });

    it("sends a first navigation that went ahead without the route to My Downloads", async () => {
        const router = testRouter();
        await router.push("/downloads");
        expect(router.currentRoute.value.name).toBe("content");
        const { deps } = makeDeps();
        const fake = await provideFakeDownloads(createApp({}), { router, deps });
        try {
            await vi.waitFor(() => expect(router.currentRoute.value.name).toBe("downloads"), 5000);
        } finally {
            fake.dispose();
        }
    });
});

describe("provideDownloads", () => {
    it("provides the service and adds My Downloads ahead of the content slugs", async () => {
        const app = createApp({});
        const router = testRouter();
        const { deps } = makeDeps();
        const service = provideDownloads(app, createFakeEngine(), { router, deps });
        expect(app.runWithContext(() => inject(DownloadsKey, undefined))).toBe(service);
        expect(router.resolve("/downloads").name).toBe("downloads");
        expect(router.resolve("/downloads").meta.title).toBe("downloads.title");
        (service as unknown as { dispose(): void }).dispose();
    });

    it("reaches components set up before the engine answered", async () => {
        providedDownloads.value = undefined;
        let seen: ReturnType<typeof useDownloads> | undefined;
        const app = createApp({
            setup() {
                seen = useDownloads();
                return () => null;
            },
        });
        app.mount(document.createElement("div"));
        expect(seen?.value).toBeUndefined();

        const { deps } = makeDeps();
        const service = provideDownloads(app, createFakeEngine(), { router: testRouter(), deps });
        expect(seen?.value).toBe(service);

        app.unmount();
        providedDownloads.value = undefined;
        (service as unknown as { dispose(): void }).dispose();
    });

    it("adds the route once when called again", () => {
        const router = testRouter();
        const { deps } = makeDeps();
        const first = provideDownloads(createApp({}), createFakeEngine(), { router, deps });
        const second = provideDownloads(createApp({}), createFakeEngine(), { router, deps });
        expect(router.getRoutes().filter((r) => r.name === "downloads")).toHaveLength(1);
        for (const s of [first, second]) (s as unknown as { dispose(): void }).dispose();
    });
});
