/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_API_URL: string;
    readonly VITE_CLIENT_APP_URL: string;

    readonly VITE_SENTRY_DSN: string;

    /** Content sync window in milliseconds. Falls back to 1 month if unset/invalid. */
    readonly VITE_CONTENT_SYNC_WINDOW_MS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
