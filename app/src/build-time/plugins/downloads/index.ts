import type { App } from "vue";

const fakeDownloadsRequested = () =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("fakeDownloads");

/**
 * The in-app downloads entry: no engine, so nothing is provided and consumers show no downloads UI. A build target
 * with an engine supplies its own entry, which hands the engine to `provideDownloads`.
 *
 * On the development server `?fakeDownloads` installs an in-memory engine instead, so the downloads UI can be tried
 * in a browser. A build replaces `import.meta.env.DEV` with false and drops the branch with its import, so neither
 * web bundle contains any of it.
 */
export function installDownloads(app: App): void | Promise<void> {
    if (import.meta.env.DEV && fakeDownloadsRequested()) {
        return import("./provide")
            .then(({ provideFakeDownloads }) => provideFakeDownloads(app))
            .then(
                () => undefined,
                (error: unknown) => console.error(error),
            );
    }
}

export { DownloadsKey } from "@/build-time/contracts/downloads/token";
export type { DownloadsService } from "@/build-time/contracts/downloads/contract";
