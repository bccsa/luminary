/**
 * The arithmetic behind the scrub preview: where a pointer lands on the timeline, what time that is,
 * which frame covers it, and where the preview may sit. Pure, so the rules a native player has to
 * reproduce — the nudge off the end, the clamping — are written down once and tested.
 */

/** How close to the bar, in pixels, the pointer still counts as being on it. A finger is not precise. */
export const SCRUB_SLOP_PX = 18;

/** How far the preview keeps from the edge of the frame, in pixels. */
export const SCRUB_EDGE_PX = 8;

/** Where `clientX` falls along `rect`, 0–1, or null when the bar has no width to measure against. */
export function pointerRatio(
    clientX: number,
    rect: { left: number; width: number },
): number | null {
    if (!(rect.width > 0)) return null;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

/** Whether the pointer is on the bar, or close enough above or below it that the viewer means it. */
export function isOnBar(
    clientX: number,
    clientY: number,
    rect: { left: number; right: number; top: number; bottom: number },
    slop = SCRUB_SLOP_PX,
): boolean {
    return (
        rect.right > rect.left &&
        clientX >= rect.left - slop &&
        clientX <= rect.right + slop &&
        clientY >= rect.top - slop &&
        clientY <= rect.bottom + slop
    );
}

/**
 * The time a ratio names, and the time to look a frame up at.
 *
 * Cue ranges are end-exclusive, so a drag to the far right of the bar lands exactly on the last cue's
 * end and matches nothing — the preview would blink out at the one position a viewer is most likely to
 * hold. The label keeps the true time; only the lookup is nudged back off the end.
 */
export function previewTimes(ratio: number, duration: number): { time: number; lookup: number } {
    const time = ratio * duration;
    return { time, lookup: Math.min(time, Math.max(0, duration - 0.001)) };
}

/**
 * Centre of a preview `width` wide, as close to `x` as keeps the whole box between `min` and `max`.
 * When the space is narrower than the box it is centred in it, which spills evenly rather than off one
 * side.
 */
export function clampPreviewCentre(x: number, width: number, min: number, max: number): number {
    const half = width / 2;
    if (max - min < width) return (min + max) / 2;
    return Math.min(max - half, Math.max(min + half, x));
}

/** `m:ss`, or `h:mm:ss` when the media runs an hour or more. */
export function formatClock(seconds: number, withHours: boolean): string {
    const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor(total / 60) % 60;
    const s = total % 60;
    const ss = String(s).padStart(2, "0");
    return withHours
        ? `${h}:${String(m).padStart(2, "0")}:${ss}`
        : `${Math.floor(total / 60)}:${ss}`;
}

/**
 * Seconds each frame stands for in the pinned roster, which is the slow, precise way through the video:
 * a quarter of the step the timeline's roster uses (the fast way), never finer than a sprite can resolve.
 * Constant while it is dragged, so the strip moves under the finger without ever rescaling.
 */
export function rosterFineStep(duration: number): number {
    return Math.max(0.5, rosterStep(duration) / 4);
}

/** One frame of the roster: where its left edge sits, and the time it shows. */
export interface RosterTile {
    /** The slot's index in time, so a tile keeps its identity as the roster slides under the pointer. */
    index: number;
    /** Left edge in px from the roster's left. */
    left: number;
    /** The time the frame is looked up at: the middle of the slot it covers. */
    time: number;
}

/**
 * Seconds each roster frame stands for. Fine enough on a short clip that the frames differ, and coarse
 * enough on a long one that the strip is a stretch of the video rather than a blur of it.
 */
export function rosterStep(duration: number): number {
    return Math.min(15, Math.max(1, duration / 120));
}

/**
 * The frames of a roster that slides under a fixed marker. Slots are fixed in time, so while the playhead
 * moves each frame keeps its picture and only its position changes: the strip scrolls rather than flickers.
 * The marker sits at `markerX` and every slot is placed by its distance in time from `time`, `tileWidth`
 * px standing for `step` seconds. Slots outside the media are left out.
 */
export function rosterTiles(
    time: number,
    markerX: number,
    width: number,
    tileWidth: number,
    step: number,
    duration: number,
): RosterTile[] {
    if (!(width > 0) || !(tileWidth > 0) || !(step > 0) || !(duration > 0)) return [];
    const pxPerSecond = tileWidth / step;
    const first = Math.floor((time - markerX / pxPerSecond) / step);
    const last = Math.ceil((time + (width - markerX) / pxPerSecond) / step);
    const tiles: RosterTile[] = [];
    for (let index = first; index <= last; index++) {
        const start = index * step;
        if (start >= duration || start + step <= 0) continue;
        tiles.push({
            index,
            left: markerX + (start - time) * pxPerSecond,
            time: Math.min(Math.max(0, start + step / 2), Math.max(0, duration - 0.001)),
        });
    }
    return tiles;
}
