/**
 * Dev flag for the EditContent "light polish" layout pass (2026-06).
 *
 * Flip to `false` to instantly restore the previous layout at runtime — every
 * change in this pass is gated behind it (search the codebase for `lightPolish`).
 *
 * To remove the experiment entirely once a decision is made: set `false`, delete
 * the `v-if="lightPolish"` / `v-else` branches it gates, then delete this file.
 */
export const lightPolish = true;
