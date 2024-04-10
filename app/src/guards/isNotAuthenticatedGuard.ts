import { runAfterAuth0IsLoaded } from "@/util/runAfterAuth0IsLoaded";
import { useAuth0 } from "@auth0/auth0-vue";
import type { NavigationGuard } from "vue-router";

export const isNotAuthenticatedGuard: NavigationGuard = async (to, from, next) => {
    const { isAuthenticated } = useAuth0();

    const callback = async () => {
        if (isAuthenticated.value) {
            return next(from);
        }

        return next();
    };

    await runAfterAuth0IsLoaded(callback);
};
