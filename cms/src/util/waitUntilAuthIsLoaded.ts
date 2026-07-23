import { useAuth0 } from "@auth0/auth0-vue";
import { watchEffectOnceAsync } from "./watchEffectOnce";
import { isAuthBypassed, isAuthPluginInstalled } from "@/auth";

export const waitUntilAuth0IsLoaded = async (callback?: Function) => {
    const fn = async () => {
        if (callback) await callback();
    };

    // In auth bypass mode, or when the Auth0 plugin was never installed, there
    // is nothing to wait for.
    if (isAuthBypassed || !isAuthPluginInstalled.value) return fn();

    const { isLoading } = useAuth0();
    if (!isLoading.value) return fn();

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
