/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_NAME: string;

    readonly VITE_API_URL: string;

    readonly VITE_AUTH0_DOMAIN: string;
    readonly VITE_AUTH0_AUDIENCE: string;
    readonly VITE_AUTH0_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
