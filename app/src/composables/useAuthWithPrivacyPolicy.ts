import { computed, ref } from "vue";
import { userPreferencesAsRef } from "@/globalConfig";
import { isAuthPluginInstalled, openProviderModal, useAuth } from "@/auth";

// Global state for privacy policy modal
export const showPrivacyPolicyModal = ref(false);
let pendingLoginAction: (() => void) | null = null;

// Reactive state to track if there's a pending login action
export const hasPendingLogin = ref(false);

// Direct read — used by the shared gate/complete helpers. Composable-scoped
// consumers get the reactive `computed` wrapper inside the function.
const isPolicyAccepted = () =>
    userPreferencesAsRef.value.privacyPolicy?.status === "accepted";

// Gate any login-starting action behind the privacy-policy modal. If the
// policy is already accepted we run `action` immediately; otherwise we stash
// it as a pending action and show the modal — completePendingLogin runs it
// after acceptance, cancelPendingLogin drops it.
function gateBehindPrivacyPolicy(action: () => void) {
    if (isPolicyAccepted()) {
        action();
        return;
    }
    pendingLoginAction = action;
    hasPendingLogin.value = true;
    showPrivacyPolicyModal.value = true;
}

function completePendingLogin() {
    if (pendingLoginAction && isPolicyAccepted()) {
        const action = pendingLoginAction;
        pendingLoginAction = null;
        hasPendingLogin.value = false;
        showPrivacyPolicyModal.value = false;
        action();
    }
}

function cancelPendingLogin() {
    if (pendingLoginAction) {
        pendingLoginAction = null;
        hasPendingLogin.value = false;
        showPrivacyPolicyModal.value = false;
    }
}

/**
 * Enhanced authentication composable that enforces privacy policy acceptance before login.
 */
export function useAuthWithPrivacyPolicy() {
    // Only use the configured OIDC manager when a provider was restored at boot.
    // Otherwise treat it as "not logged in" and fall back to the provider
    // selection modal — but *still* gate that fallback behind the privacy
    // policy, because for first-time multi-provider users this is the primary
    // login path (the Auth0 plugin only mounts after a provider has been picked).
    const auth = isAuthPluginInstalled.value ? useAuth() : undefined;

    // Reactive wrapper for template binding.
    const isPrivacyPolicyAccepted = computed(() => isPolicyAccepted());

    if (!auth) {
        return {
            isAuthenticated: computed(() => false),
            user: computed(() => null),
            logout: () => {},
            loginWithRedirect: () => gateBehindPrivacyPolicy(() => openProviderModal()),
            isPrivacyPolicyAccepted,
            showPrivacyPolicyModal,
            hasPendingLogin,
            completePendingLogin,
            cancelPendingLogin,
        };
    }

    const { isAuthenticated, user, loginWithRedirect: originalLoginWithRedirect, logout } = auth;

    const loginWithRedirect = () => gateBehindPrivacyPolicy(() => originalLoginWithRedirect());

    return {
        isAuthenticated,
        user,
        logout,
        loginWithRedirect,
        isPrivacyPolicyAccepted,
        showPrivacyPolicyModal,
        hasPendingLogin,
        completePendingLogin,
        cancelPendingLogin,
    };
}
