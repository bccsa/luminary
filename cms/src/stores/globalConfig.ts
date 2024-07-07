import { defineStore } from "pinia";

export const useGlobalConfigStore = defineStore("globalConfig", () => {
    const appName = import.meta.env.VITE_APP_NAME;
    const apiUrl = import.meta.env.VITE_API_URL;
    const clientAppUrl = import.meta.env.VITE_CLIENT_APP_URL;
    const isDevMode = import.meta.env.DEV;

    return { appName, apiUrl, clientAppUrl, isDevMode };
});
