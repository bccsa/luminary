import { ref } from "vue";

/**
 * Whether images may advertise their full `sizes` slot yet. Prerendered pages deliberately ship
 * the lighter reduced slot so the pre-JS fetch is small, and the SSG client replaces that DOM with
 * fresh elements — so until the client has painted one frame with the build's slot, an image that
 * advertised anything else would resolve a different srcset rung and discard the download the page
 * already made. `false` only in the web build, and only until that first frame.
 */
export const ssgSlotUpgraded = ref(import.meta.env.VITE_BUILD_TARGET !== "web");

/**
 * Release the prerendered slot one frame after the client's first mount, so the light image paints
 * before the browser is asked for the full-resolution rung. Safe to call from every image; it
 * no-ops once the slot is released, so images mounted later (client-side navigation) never take
 * the two-fetch path.
 */
export function upgradeSsgSlotAfterFirstFrame(): void {
    if (ssgSlotUpgraded.value) return;
    requestAnimationFrame(() => {
        ssgSlotUpgraded.value = true;
    });
}
