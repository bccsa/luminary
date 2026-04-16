import { useAuth0 } from "@auth0/auth0-vue";
import { watchEffectOnceAsync } from "./watchEffectOnce";
import { isAuthPluginInstalled } from "@/auth";

export const waitUntilAuth0IsLoaded = async (callback?: Function) => {
    const fn = async () => {
        if (callback) await callback();
    };

    // Nothing to wait for if the Auth0 plugin was never installed at load.
    if (!isAuthPluginInstalled.value) return fn();

    const { isLoading } = useAuth0();
    if (!isLoading.value) return fn();

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
