import { defineStore } from "pinia";
import { ref } from "vue";
import type { OAuthProviderPublicDto } from "luminary-shared";

const PROVIDER_ID_KEY = "selectedProviderId";

/**
 * Module-level ref so the fetch interceptor can read the provider ID
 * without needing a Pinia context. Initialized from localStorage so it
 * survives the Auth0 redirect/page-reload cycle.
 */
export const selectedProviderId = ref<string | null>(localStorage.getItem(PROVIDER_ID_KEY));

export const useAuthProviderStore = defineStore("authProvider", () => {
    const selectedProvider = ref<OAuthProviderPublicDto | null>(null);

    function setProvider(provider: OAuthProviderPublicDto) {
        selectedProviderId.value = provider._id;
        selectedProvider.value = provider;
        localStorage.setItem(PROVIDER_ID_KEY, provider._id);
    }

    function clearProvider() {
        selectedProviderId.value = null;
        selectedProvider.value = null;
        localStorage.removeItem(PROVIDER_ID_KEY);
    }

    /**
     * Clear all Auth0 tokens from localStorage.
     * Auth0 SPA JS stores entries with the prefix @@auth0spajs@@ and a0.spajs.
     */
    function clearAuth0Tokens() {
        const keysToRemove = Object.keys(localStorage).filter(
            (k) => k.startsWith("@@auth0spajs@@") || k.startsWith("a0.spajs"),
        );
        keysToRemove.forEach((k) => localStorage.removeItem(k));
    }

    /**
     * Global logout: clears the in-memory provider, wipes stored Auth0 tokens,
     * and reloads the page so the app reconnects anonymously (public access).
     */
    function globalLogout() {
        clearProvider();
        clearAuth0Tokens();
        // Reload so the socket reconnects without a token, restoring public access
        window.location.href = window.location.origin;
    }

    return {
        selectedProvider,
        setProvider,
        clearProvider,
        globalLogout,
    };
});
