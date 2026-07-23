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
    return {
        activeProviderId: ref<string | null>(null),
        clearAuthCache: vi.fn(),
        isAuthPluginInstalled: ref(true),
        openProviderModal: vi.fn(),
        showProviderSelectionModal: ref(false),
        useAuth: vi.fn(() => ({
            isLoading: ref(false),
            isAuthenticated: ref(false),
            user: ref(null),
            loginWithRedirect: vi.fn(),
            logout: vi.fn(),
        })),
    };
}
