import type { Ref } from "vue";

/** Newer versions of the installed app, distributed through its app store. */
export type AppUpdateService = {
    /** Version of the installed app; `undefined` where the app isn't installed from a store. */
    readonly installedVersion: Readonly<Ref<string | undefined>>;

    /** Newest version of the app in its store, once known. */
    readonly storeVersion: Readonly<Ref<string | undefined>>;

    /**
     * When the store version was last checked, also when it didn't change, so reminders
     * can be reconsidered while the app stays open.
     */
    readonly storeCheckedAt: Readonly<Ref<number | undefined>>;

    /** Open the app's page in its store. No-op where there is no store. */
    openStore(): void;
};
