import type { Ref } from "vue";

/**
 * A newer version of the app. A `reload` update is a new deploy that reloading picks up;
 * a `store` update is a new release the user installs from the app's store.
 */
export type AvailableUpdate =
    | { readonly kind: "reload"; readonly version: string }
    | { readonly kind: "store"; readonly version: string };

/** Newer versions of the app, and how the user gets them on this platform. */
export type AppUpdateService = {
    /** Version of the installed app; `undefined` where there is no installed version to show. */
    readonly installedVersion: Readonly<Ref<string | undefined>>;

    /** The newer version the user can update to; `undefined` while up to date or unknown. */
    readonly available: Readonly<Ref<AvailableUpdate | undefined>>;

    /**
     * When updates were last checked, also when nothing changed, so reminders can be
     * reconsidered while the app stays open.
     */
    readonly checkedAt: Readonly<Ref<number | undefined>>;

    /** Take the user to the available update. No-op when there is none. */
    applyUpdate(): void;
};
