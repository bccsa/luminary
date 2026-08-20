import { computed, ref } from "vue";
import { isKratosEnabled, logout, whoami } from "./client";
import type { KratosSessionListEntry } from "./types";

/**
 * The Kratos session, when the proof of concept is switched on. Null is the
 * ordinary guest state, not an error — and it stays null while VITE_KRATOS_URL
 * is unset, so nothing that reads this changes behaviour with Kratos absent.
 *
 * Deliberately separate from `@/auth`'s OIDC session: a Kratos session proves
 * nothing to the Luminary API, so conflating the two would have the app claim
 * an authority it does not have.
 */
export const kratosSession = ref<KratosSessionListEntry | null>(null);

export const kratosIdentityLabel = computed(() => {
    const traits = kratosSession.value?.identity?.traits;
    return traits?.name || traits?.email || "";
});

export async function refreshKratosSession(): Promise<void> {
    if (!isKratosEnabled()) return;
    kratosSession.value = await whoami();
}

export async function signOutKratos(): Promise<void> {
    await logout();
    kratosSession.value = null;
}
