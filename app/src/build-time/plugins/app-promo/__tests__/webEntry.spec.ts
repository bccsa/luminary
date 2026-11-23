import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, inject } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { routes } from "@/router/routes";
import { AppPromoKey } from "@/build-time/contracts/app-promo/token";

// The setup callback main.web.ts hands to ViteSSG, run on either side of the prerender.
const captured = vi.hoisted(() => ({
    setup: undefined as ((ctx: any) => Promise<void>) | undefined,
}));
vi.mock("vite-ssg", () => ({
    ViteSSG: (_app: unknown, _opts: unknown, fn: (ctx: any) => Promise<void>) => {
        captured.setup = fn;
        return () => undefined;
    },
}));
vi.mock("@/App.vue", () => ({ default: {} }));
vi.mock("@/i18n", () => ({ initI18n: () => ({ install: () => undefined }) }));
vi.mock("@/auth", () => ({ setupAuth: vi.fn(async () => undefined) }));
vi.mock("@/util/ssgTextRecovery", () => ({ captureSsgArticleTextSnapshot: vi.fn() }));
vi.mock("@/ssg/hydrationLanguage", () => ({ applyServedLanguage: vi.fn() }));
vi.mock("@/ssg/clientRuntime", () => ({
    initSsgClient: vi.fn(async () => undefined),
    installSsgAppPromo: vi.fn(),
}));
vi.mock("virtual:app-promo", () => ({ installAppPromo: vi.fn() }));
vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    initHybridQuery: vi.fn(),
    queryRemote: vi.fn(async () => []),
}));

const prerender = vi.hoisted(() => ({ value: false }));
vi.mock("@/ssg/isPrerender", () => ({ isPrerender: () => prerender.value }));

async function runSetup() {
    await import("@/main.web");
    const ctx = {
        app: createApp({}),
        router: createRouter({ history: createMemoryHistory(), routes }),
        initialState: {} as Record<string, unknown>,
        routePath: "/",
    };
    await captured.setup!(ctx);
    return ctx;
}

describe("main.web.ts and the promotion plugin", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        prerender.value = false;
    });

    it("never installs it during the prerender, which renders only its empty holder", async () => {
        prerender.value = true;
        const { installAppPromo } = await import("virtual:app-promo");
        const { installSsgAppPromo } = await import("@/ssg/clientRuntime");

        const { app } = await runSetup();
        await new Promise((resolve) => setTimeout(resolve));

        expect(installAppPromo).not.toHaveBeenCalled();
        expect(installSsgAppPromo).not.toHaveBeenCalled();
        const holder = app.runWithContext(() => inject(AppPromoKey, undefined));
        expect(holder?.component("player-download")).toBeUndefined();
    });

    it("hands it to the client runtime to install after hydration", async () => {
        const { installSsgAppPromo } = await import("@/ssg/clientRuntime");

        const { app, router } = await runSetup();
        await new Promise((resolve) => setTimeout(resolve));

        expect(installSsgAppPromo).toHaveBeenCalledWith(app, router);
        expect(app.runWithContext(() => inject(AppPromoKey, undefined))).toBeDefined();
    });
});
