import { watchEffectOnceAsync } from "@/util/watchEffectOnce";
import { useAuth0 } from "@auth0/auth0-vue";
import type { NavigationGuard } from "vue-router";

export const isNotAuthenticatedGuard: NavigationGuard = async (to, from, next) => {
    const { isAuthenticated, isLoading } = useAuth0();

    const fn = async () => {
        if (isAuthenticated.value) {
            return next(from);
        }

        return next();
    };

    if (!isLoading.value) {
        return fn();
    }

    await watchEffectOnceAsync(() => !isLoading.value);

    return fn();
};
