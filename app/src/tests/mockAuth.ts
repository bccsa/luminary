import { ref } from "vue";
import { vi } from "vitest";

/**
 * Shared shape for `vi.mock("@/auth", ...)` factories, covering every field
 * component tests currently touch. A superset is safe to use everywhere —
 * unused fields are simply ignored — and keeps ~9 near-identical mock blocks
 * from drifting out of sync with `@/auth`'s actual exports as it evolves.
 *
 * Tests override whatever they need per-case, the same way they already did
 * with the inline blocks this replaces, e.g.:
 *   (auth as any).useAuth.mockReturnValue({ isAuthenticated: ref(true), ... });
 */
export function createAuthMock() {
    const isAuthenticated = ref(false);
    const user = ref(null);
    return {
        isAuthenticated,
        user,
        activeProviderId: ref<string | null>(null),
        clearAuthCache: vi.fn(),
        hasPersistedSession: vi.fn(() => false),
        isAuthPluginInstalled: ref(true),
        openProviderModal: vi.fn(),
        closeProviderModal: vi.fn(),
        providerModalReturnTo: ref<string | undefined>(undefined),
        showProviderSelectionModal: ref(false),
        useAuth: vi.fn(() => ({
            isLoading: ref(false),
            isAuthenticated,
            user,
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        })),
    };
}
