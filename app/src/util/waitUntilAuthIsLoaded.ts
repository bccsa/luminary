import { watchEffectOnceAsync } from "./watchEffectOnce";
import { isAuthPluginInstalled, useAuth } from "@/auth";

export const waitUntilAuthIsLoaded = async (callback?: Function) => {
    const fn = async () => {
        if (callback) await callback();
    };

    // Nothing to wait for if no OIDC manager was ever installed at load.
    if (!isAuthPluginInstalled.value) return fn();

    const { isLoading } = useAuth();
    if (!isLoading.value) return fn();

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
