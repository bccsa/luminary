import { defineStore } from "pinia";

export const useGlobalConfigStore = defineStore("globalConfig", () => {
    const appName = import.meta.env.VITE_APP_NAME;

    return { appName };
});
