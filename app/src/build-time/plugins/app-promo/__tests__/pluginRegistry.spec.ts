import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, inject } from "vue";
import { AppPromoKey } from "@/build-time/contracts/app-promo/token";

const calls = vi.hoisted(() => [] as string[]);
const installer = (name: string) => () => {
    calls.push(name);
};

vi.mock("virtual:demo-banner", () => ({
    installDemoBanner: vi.fn(installer("demoBanner")),
    DemoBannerKey: Symbol("DemoBannerKey"),
}));
vi.mock("virtual:platform-chrome", () => ({
    installPlatformChrome: vi.fn(installer("platformChrome")),
    PlatformChromeKey: Symbol("PlatformChromeKey"),
}));
vi.mock("virtual:auth-flow", () => ({
    installAuthFlow: vi.fn(installer("authFlow")),
    AuthFlowKey: Symbol("AuthFlowKey"),
}));
vi.mock("virtual:screen-wake", () => ({
    installScreenWake: vi.fn(installer("screenWake")),
    ScreenWakeKey: Symbol("ScreenWakeKey"),
}));
vi.mock("virtual:video-player", () => ({
    installVideoPlayer: vi.fn(installer("videoPlayer")),
    VideoPlayerKey: Symbol("VideoPlayerKey"),
}));
vi.mock("virtual:app-update", () => ({
    installAppUpdate: vi.fn(installer("appUpdate")),
    AppUpdateKey: Symbol("AppUpdateKey"),
}));
vi.mock("virtual:share", () => ({
    installShare: vi.fn(installer("share")),
    ShareKey: Symbol("ShareKey"),
}));
vi.mock("virtual:downloads", () => ({
    installDownloads: vi.fn(installer("downloads")),
    DownloadsKey: Symbol("DownloadsKey"),
}));
vi.mock("virtual:app-promo", () => ({
    installAppPromo: vi.fn(installer("appPromo")),
    AppPromoKey: Symbol("AppPromoKey"),
}));

const { installPlugins, appPluginsManager } =
    await import("@/build-time/contracts/plugin-registry");
const { installDownloads } = await import("virtual:downloads");
const { installAppPromo } = await import("virtual:app-promo");

/** Whether `promise` has settled once pending callbacks have run. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
    let done = false;
    void promise.then(
        () => (done = true),
        () => (done = true),
    );
    await new Promise((resolve) => setTimeout(resolve));
    return done;
}

describe("installPlugins", () => {
    beforeEach(() => {
        calls.length = 0;
        vi.mocked(installDownloads).mockImplementation(installer("downloads"));
        vi.mocked(installAppPromo).mockImplementation(installer("appPromo"));
    });

    it("installs every plugin, in order", async () => {
        await installPlugins(createApp({}));

        expect(calls).toEqual([
            "demoBanner",
            "platformChrome",
            "authFlow",
            "screenWake",
            "videoPlayer",
            "appUpdate",
            "share",
            "downloads",
            "appPromo",
        ]);
    });

    it("settles at once when downloads install synchronously", async () => {
        expect(await settled(installPlugins(createApp({})))).toBe(true);
    });

    it("settles only once the downloads installer's promise does", async () => {
        let answer!: () => void;
        vi.mocked(installDownloads).mockReturnValue(
            new Promise<void>((resolve) => (answer = resolve)),
        );

        const ready = installPlugins(createApp({}));
        expect(await settled(ready)).toBe(false);

        answer();
        expect(await settled(ready)).toBe(true);
    });

    it("resolves, logging the error, when the downloads installer rejects", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(installDownloads).mockRejectedValue(new Error("no engine"));

        await expect(installPlugins(createApp({}))).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "no engine" }));
        error.mockRestore();
    });

    it("launches, logging the error, when an optional installer throws", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(installAppPromo).mockImplementation(() => {
            throw new Error("no promo");
        });
        vi.mocked(installDownloads).mockImplementation(() => {
            throw new Error("no engine");
        });

        await expect(installPlugins(createApp({}))).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "no promo" }));
        expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: "no engine" }));
        error.mockRestore();
    });

    it("does not wait for the promotion plugin", async () => {
        vi.mocked(installAppPromo).mockReturnValue(new Promise<void>(() => undefined));

        expect(await settled(installPlugins(createApp({})))).toBe(true);
    });

    it("provides the promotion holder before the promotion plugin installs", () => {
        const app = createApp({});
        let holderAtInstall: unknown;
        vi.mocked(installAppPromo).mockImplementation((target) => {
            holderAtInstall = target.runWithContext(() => inject(AppPromoKey, undefined));
        });

        void installPlugins(app);

        expect(holderAtInstall).toBeDefined();
        expect(app.runWithContext(() => inject(AppPromoKey, undefined))).toBe(holderAtInstall);
    });

    it("installs through app.use as well", () => {
        createApp({}).use(appPluginsManager);

        expect(calls).toContain("downloads");
        expect(calls).toContain("appPromo");
    });
});
