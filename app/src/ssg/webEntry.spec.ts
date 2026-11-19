import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { routes } from "@/router/routes";
import { markPageReady, renderState } from "@/util/renderState";

// Capture the setup callback main.web.ts hands to ViteSSG so it can run against a test router.
type SetupContext = {
    app: ReturnType<typeof createApp>;
    router: ReturnType<typeof createRouter>;
    initialState: Record<string, unknown>;
    routePath?: string;
};
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
vi.mock("@/ssg/clientRuntime", () => ({ initSsgClient: vi.fn(async () => undefined) }));
vi.mock("@/auth", () => ({ setupAuth: vi.fn(async () => undefined) }));
vi.mock("@/userActivity/source", () => ({
    setupUserActivitySync: vi.fn(async () => undefined),
}));
vi.mock("@/util/ssgTextRecovery", () => ({ captureSsgArticleTextSnapshot: vi.fn() }));
vi.mock("@/ssg/hydrationLanguage", () => ({ applyServedLanguage: vi.fn() }));

const TELEGRAM_UA = "Mozilla/5.0 (Linux; Android 14) Telegram-Android/11.0";

async function runClientSetup(): Promise<SetupContext> {
    await import("@/main.web");
    const ctx: SetupContext = {
        app: createApp({}),
        router: createRouter({ history: createMemoryHistory(), routes }),
        initialState: {},
    };
    await captured.setup!(ctx);
    ctx.app.use(ctx.router);
    return ctx;
}

describe("main.web.ts client setup", () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("registers the app's navigation guards on the ViteSSG router", async () => {
        vi.spyOn(navigator, "userAgent", "get").mockReturnValue(TELEGRAM_UA);
        const { router } = await runClientSetup();

        await router.push("/explore");

        expect(router.currentRoute.value.name).toBe("open-warning");
    });

    it("marks the app ready so the render state follows the page", async () => {
        await runClientSetup();

        markPageReady();

        expect(renderState.value).toBe("ready");
    });
});
