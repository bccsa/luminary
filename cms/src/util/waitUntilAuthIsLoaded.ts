import { watchEffectOnceAsync } from "./watchEffectOnce";
import { isAuthBypassed, isAuthPluginInstalled, useAuth } from "@/auth";

export const waitUntilAuthIsLoaded = async (callback?: Function) => {
    const fn = async () => {
        if (callback) await callback();
    };

    // In auth bypass mode, or when no OIDC manager was installed, there is
    // nothing to wait for.
    if (isAuthBypassed || !isAuthPluginInstalled.value) return fn();

    const { isLoading } = useAuth();
    if (!isLoading.value) return fn();

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
