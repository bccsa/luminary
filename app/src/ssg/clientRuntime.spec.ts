import { beforeEach, describe, expect, it, vi } from "vitest";

// clientRuntime.ts is a thin orchestrator over shared/app singletons — these tests
// verify the ORDER it calls them in (documented as load-bearing in the file's own
// comments), not their individual behavior, which is covered by their own specs.

vi.mock("luminary-shared", () => ({
    getSocket: vi.fn(),
    init: vi.fn(),
    warmMangoCaches: vi.fn(),
}));

vi.mock("@/globalConfig", () => ({
    apiUrl: "http://localhost:12345",
    appLanguageIdsAsRef: { value: [] },
    initLanguage: vi.fn(),
}));

vi.mock("@/docsIndex", () => ({
    APP_DOCS_INDEX: "mock-docs-index",
}));

vi.mock("@/sync", () => ({
    initAuthLangSync: vi.fn(),
    initSync: vi.fn(),
}));

const { initSsgClient } = await import("./clientRuntime");
const { getSocket, init, warmMangoCaches } = await import("luminary-shared");
const { apiUrl, appLanguageIdsAsRef, initLanguage } = await import("@/globalConfig");
const { APP_DOCS_INDEX } = await import("@/docsIndex");
const { initAuthLangSync, initSync } = await import("@/sync");

describe("clientRuntime.initSsgClient", () => {
    const connect = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSocket).mockReturnValue({
            connect,
        } as unknown as ReturnType<typeof getSocket>);
        vi.mocked(init).mockResolvedValue(undefined);
        vi.mocked(initLanguage).mockResolvedValue(undefined);
    });

    it("warms mango caches before opening the shared data layer", async () => {
        const order: string[] = [];
        vi.mocked(warmMangoCaches).mockImplementation(() => {
            order.push("warmMangoCaches");
        });
        vi.mocked(init).mockImplementation(async () => {
            order.push("init");
        });

        await initSsgClient();

        expect(order).toEqual(["warmMangoCaches", "init"]);
    });

    it("passes the app's shared config (docsIndex/apiUrl/appLanguageIdsAsRef) to init()", async () => {
        await initSsgClient();

        expect(init).toHaveBeenCalledWith({
            cms: false,
            docsIndex: APP_DOCS_INDEX,
            apiUrl,
            appLanguageIdsAsRef,
        });
    });

    it("connects the socket and starts language/content sync only AFTER init() resolves", async () => {
        const order: string[] = [];
        vi.mocked(init).mockImplementation(async () => {
            order.push("init");
        });
        connect.mockImplementation(() => order.push("connect"));
        vi.mocked(initAuthLangSync).mockImplementation(() => order.push("initAuthLangSync"));
        vi.mocked(initSync).mockImplementation(() => order.push("initSync"));

        await initSsgClient();

        expect(order).toEqual(["init", "connect", "initAuthLangSync", "initSync"]);
    });

    it("resolves without waiting on initLanguage() so hydration is never network-blocked", async () => {
        vi.mocked(initLanguage).mockReturnValue(new Promise<void>(() => {})); // never resolves

        await expect(initSsgClient()).resolves.toBeUndefined();
        expect(initLanguage).toHaveBeenCalled();
    });
});
