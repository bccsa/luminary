import type { App } from "vue";
import type { Router } from "vue-router";
import appRouter from "@/router";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";
import type { DownloadsEngine, DownloadsService } from "@/build-time/contracts/downloads/contract";
import { createDownloadsService } from "@/downloads/service";
import { createAppDeps } from "@/downloads/appDeps";
import type { DownloadsDeps } from "@/downloads/deps";

export type ProvideDownloadsOptions = {
    router?: Router;
    /** Replaces the app's own sources, for tests. */
    deps?: DownloadsDeps;
};

/**
 * Turns a build target's engine into the app's downloads: builds the service, adds My Downloads at `/downloads`, and
 * provides the service under `DownloadsKey`. The only way into the downloads code, so a build that never calls it
 * carries none of it.
 */
export function provideDownloads(
    app: App,
    engine: DownloadsEngine,
    options: ProvideDownloadsOptions = {},
): DownloadsService {
    const router = options.router ?? appRouter;
    const service = createDownloadsService(engine, options.deps ?? createAppDeps({ app, router }));
    if (!router.hasRoute("downloads")) {
        router.addRoute({
            path: "/downloads",
            name: "downloads",
            component: () => import("@/downloads/ui/DownloadsPage.vue"),
            meta: { title: "downloads.title" },
        });
    }
    app.provide(DownloadsKey, service);
    return service;
}

/**
 * Development only: downloads over an in-memory engine, with a panel that plays the platform's sheet. It arrives
 * through a lazy import, so a first navigation to `/downloads` that went ahead without the route goes again.
 */
export async function provideFakeDownloads(
    app: App,
    options: ProvideDownloadsOptions = {},
): Promise<{ service: DownloadsService; dispose(): void }> {
    const [{ createFakeEngine }, { mountFakeDownloadsPanel }] = await Promise.all([
        import("@/downloads/fakeEngine"),
        import("@/downloads/ui/fakePanel"),
    ]);
    const router = options.router ?? appRouter;
    const engine = createFakeEngine({ intervalMs: 1500, card: true });
    const service = provideDownloads(app, engine, { ...options, router });
    const unmountPanel = mountFakeDownloadsPanel(engine);
    void router.isReady().then(() => {
        const here = router.currentRoute.value;
        if (here.name !== "downloads" && router.resolve(here.fullPath).name === "downloads") {
            void router.replace(here.fullPath);
        }
    });
    return {
        service,
        dispose() {
            unmountPanel();
            (service as DownloadsService & { dispose?(): void }).dispose?.();
            engine.dispose();
        },
    };
}
