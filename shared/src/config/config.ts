import { useLocalStorage } from "@vueuse/core";
import { readonly } from "vue";

/**
 * Application configuration class
 */
class Config {
    /**
     * Application name imported from Vite environment variable VITE_APP_NAME
     */
    public readonly appName = import.meta.env.VITE_APP_NAME;
    /**
     * API URL imported from Vite environment variable VITE_API_URL
     */
    public readonly apiUrl = import.meta.env.VITE_API_URL;
    /**
     * Application URL imported from Vite environment variable VITE_APP_URL
     */
    public readonly appUrl = import.meta.env.VITE_APP_URL;
    /**
     * CMS mode flag imported from Vite environment variable VITE_IS_CMS
     */
    public readonly isCms = import.meta.env.VITE_IS_CMS;
    /**
     * Development mode flag imported from Vite environment variable DEV
     */
    public readonly isDevMode = import.meta.env.DEV;

    private _maxUploadFileSize = useLocalStorage("maxUploadFileSize", 0);

    /**
     * Set the maximum file size for uploads
     * @param value - Maximum file size in bytes
     */
    public setMaxUploadFileSize(value: number) {
        this._maxUploadFileSize.value = value;
    }

    /**
     * Maximum file size for uploads in bytes as a Vue readonly ref
     */
    public maxUploadFileSize = readonly(this._maxUploadFileSize);
}

/**
 * Application configuration instance
 */
export const config = new Config();
