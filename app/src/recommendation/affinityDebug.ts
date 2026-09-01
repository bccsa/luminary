import { ref } from "vue";
import type { LocationQueryValue } from "vue-router";

/**
 * Session-scoped toggle for the affinity debug overlay (`?affinityDebug`).
 *
 * The overlay exists to watch the affinity profile change while moving through content,
 * so the flag is held here rather than read off the current route — a navigation drops
 * the query param, and with it the overlay. Kept in `sessionStorage` so it also survives
 * a reload and stays scoped to the tab it was enabled in.
 */
const STORAGE_KEY = "affinityDebugOverlay";

/** Values that switch the overlay back off; anything else (including a bare param) enables it. */
const OFF_VALUES = new Set(["false", "0", "off", "no"]);

function readStored(): boolean {
    try {
        return sessionStorage.getItem(STORAGE_KEY) === "true";
    } catch {
        // sessionStorage is absent during the SSG prerender and can throw in private mode.
        return false;
    }
}

function persist(enabled: boolean) {
    try {
        if (enabled) sessionStorage.setItem(STORAGE_KEY, "true");
        else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // See readStored().
    }
}

/** Whether the affinity debug overlay should be shown. */
export const affinityDebugEnabled = ref(readStored());

/**
 * Apply the route's `affinityDebug` query param. An absent param leaves the flag as it
 * is, so the overlay survives navigation away from the URL that enabled it.
 */
export function applyAffinityDebugQuery(
    value: LocationQueryValue | LocationQueryValue[] | undefined,
) {
    const raw = Array.isArray(value) ? value[value.length - 1] : value;
    if (raw === undefined) return;

    const enabled = raw === null || !OFF_VALUES.has(raw.toLowerCase());
    affinityDebugEnabled.value = enabled;
    persist(enabled);
}
