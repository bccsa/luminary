import { useAuth0 } from "@auth0/auth0-vue";
import { computed, ref } from "vue";
import { userPreferencesAsRef } from "@/globalConfig";

// Global state for privacy policy modal
export const showPrivacyPolicyModal = ref(false);
let pendingLoginAction: (() => void) | null = null;

// Reactive state to track if there's a pending login action
export const hasPendingLogin = ref(false);

/**
 * Enhanced authentication composable that enforces privacy policy acceptance before login.
 */
export function useAuthWithPrivacyPolicy() {
    const auth0 = useAuth0();

    // Guard against undefined auth0 (can happen in test environments)
    if (!auth0) {
        return {
            isAuthenticated: computed(() => false),
            user: computed(() => null),
            logout: () => {},
            loginWithRedirect: () => {},
            isPrivacyPolicyAccepted: computed(() => false),
            showPrivacyPolicyModal,
            hasPendingLogin,
            completePendingLogin: () => {},
            cancelPendingLogin: () => {},
        };
    }

    const { isAuthenticated, user, loginWithRedirect: originalLoginWithRedirect, logout } = auth0;

    // Check if privacy policy is accepted
    const isPrivacyPolicyAccepted = computed(() => {
        return userPreferencesAsRef.value.privacyPolicy?.status === "accepted";
    });

    // Enhanced login function that checks privacy policy first
    const loginWithRedirect = () => {
        if (isPrivacyPolicyAccepted.value) {
            // Privacy policy is already accepted, proceed with login
            originalLoginWithRedirect();
        } else {
            // Privacy policy not accepted, show modal first
            pendingLoginAction = () => originalLoginWithRedirect();
            hasPendingLogin.value = true;
            showPrivacyPolicyModal.value = true;
        }
    };

    // Function to complete pending login after privacy policy acceptance
    const completePendingLogin = () => {
        if (pendingLoginAction && isPrivacyPolicyAccepted.value) {
            const action = pendingLoginAction;
            pendingLoginAction = null;
            hasPendingLogin.value = false;
            showPrivacyPolicyModal.value = false;
            action();
        }
    };

    // Handle modal close without accepting
    const cancelPendingLogin = () => {
        if (pendingLoginAction) {
            pendingLoginAction = null;
            hasPendingLogin.value = false;
            showPrivacyPolicyModal.value = false;
        }
    };

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
