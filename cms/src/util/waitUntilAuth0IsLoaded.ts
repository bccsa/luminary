import { useAuth0 } from "@auth0/auth0-vue";
import { watchEffectOnceAsync } from "./watchEffectOnce";
import { isAuthBypassed } from "@/auth";

export const waitUntilAuth0IsLoaded = async (callback?: Function) => {
    // In auth bypass mode, auth is never loading
    if (isAuthBypassed) {
        if (callback) await callback();
        return;
    }

    const { isLoading } = useAuth0();

    const fn = async () => {
        if (callback) await callback();
    };

    if (!isLoading.value) {
        return fn();
    }

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
