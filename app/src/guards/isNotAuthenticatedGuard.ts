import { waitUntilAuthIsLoaded } from "@/util/waitUntilAuthIsLoaded";
import type { NavigationGuard } from "vue-router";
import { isAuthPluginInstalled, useAuth } from "@/auth";

export const isNotAuthenticatedGuard: NavigationGuard = async (to, from, next) => {
    // No OIDC manager installed — user is definitionally unauthenticated.
    if (!isAuthPluginInstalled.value) return next();

    const { isAuthenticated } = useAuth();
    const callback = async () => {
        if (isAuthenticated.value) {
            return next(from);
        }
        return next();
    };

    await waitUntilAuthIsLoaded(callback);
};
