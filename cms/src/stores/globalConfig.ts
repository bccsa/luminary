import { defineStore } from "pinia";

export const useGlobalConfigStore = defineStore("globalConfig", () => {
    const appName = import.meta.env.VITE_APP_NAME;
    const isDevMode = import.meta.env.DEV;

    return { appName, isDevMode };
});
