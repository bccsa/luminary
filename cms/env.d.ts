/// <reference types="vite/client" />

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_API_URL: string;
    readonly VITE_CLIENT_APP_URL: string;
    readonly VITE_CLIENT_IMAGES_URL: string;

    readonly VITE_AUTH0_DOMAIN: string;
    readonly VITE_AUTH0_AUDIENCE: string;
    readonly VITE_AUTH0_CLIENT_ID: string;

    readonly VITE_SENTRY_DSN: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
