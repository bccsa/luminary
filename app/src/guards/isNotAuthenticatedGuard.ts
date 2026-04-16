import { waitUntilAuth0IsLoaded } from "@/util/waitUntilAuth0IsLoaded";
import { useAuth0 } from "@auth0/auth0-vue";
import type { NavigationGuard } from "vue-router";
import { isAuthPluginInstalled } from "@/auth";

export const isNotAuthenticatedGuard: NavigationGuard = async (to, from, next) => {
    // No Auth0 plugin installed — user is definitionally unauthenticated.
    if (!isAuthPluginInstalled.value) return next();

    const { isAuthenticated } = useAuth0();
    const callback = async () => {
        if (isAuthenticated.value) {
            return next(from);
        }
        return next();
    };

    await waitUntilAuth0IsLoaded(callback);
};
