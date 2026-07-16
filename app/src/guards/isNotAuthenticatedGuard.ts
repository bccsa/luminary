import { waitUntilAuth0IsLoaded } from "@/util/waitUntilAuth0IsLoaded";
import type { NavigationGuard } from "vue-router";
import { isAuthPluginInstalled, useAuth } from "@/auth";

export const isNotAuthenticatedGuard: NavigationGuard = async (to, from, next) => {
    // No Auth0 plugin installed — user is definitionally unauthenticated.
    if (!isAuthPluginInstalled.value) return next();

    const { isAuthenticated } = useAuth();
    const callback = async () => {
        if (isAuthenticated.value) {
            return next(from);
        }
        return next();
    };

    await waitUntilAuth0IsLoaded(callback);
};
