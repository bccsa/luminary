/**
 * The time row of the Video.js 10 skin: what has played on the left of the bar, what is left (`-1:53`) on
 * the right. Whole seconds, so the two always add up to the length. A live stream has only `LIVE`.
 */
function clock(seconds: number, guide: number): string {
    const whole = Math.max(Math.floor(Number.isFinite(seconds) ? seconds : 0), 0);
    const guideWhole = Math.max(Math.floor(Number.isFinite(guide) ? guide : 0), 0);
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const s = String(whole % 60).padStart(2, "0");
    if (h > 0 || guideWhole >= 3600) return `${h}:${String(m).padStart(2, "0")}:${s}`;
    // Minutes are padded when the length has ten or more of them, so the two ends stay the same width.
    const minutes = Math.floor(whole / 60);
    return `${guideWhole >= 600 ? String(minutes).padStart(2, "0") : minutes}:${s}`;
}

export function timeEnds(
    position: number,
    duration: number,
    live = false,
): { elapsed: string; remaining: string } {
    if (live) return { elapsed: "LIVE", remaining: "" };
    const total = Math.max(duration, position);
    const left = Math.max(Math.floor(total) - Math.floor(position), 0);
    return { elapsed: clock(position, total), remaining: `-${clock(left, total)}` };
}
