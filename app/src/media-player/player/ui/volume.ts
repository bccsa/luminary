/** How far a press of the plus or minus button moves the volume: a tenth of the range. */
export const VOLUME_STEP = 0.1;

/**
 * The volume one press of the plus (`+1`) or minus (`-1`) button leads to.
 *
 * Rounded to a hundredth because repeated float addition drifts — three presses from 0 would read
 * 0.30000000000000004, which a slider and a screen reader would both show — and clamped to 0–1, the
 * range the media element accepts and throws outside of.
 */
export function stepVolume(current: number, direction: 1 | -1, step = VOLUME_STEP): number {
    const from = Number.isFinite(current) ? current : 0;
    const next = Math.round((from + direction * step) * 100) / 100;
    return Math.min(1, Math.max(0, next));
}
