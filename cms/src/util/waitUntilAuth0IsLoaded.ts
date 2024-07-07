import { useAuth0 } from "@auth0/auth0-vue";
import { watchEffectOnceAsync } from "./watchEffectOnce";

export const waitUntilAuth0IsLoaded = async (callback?: Function) => {
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
