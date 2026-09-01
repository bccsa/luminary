import { describe, expect, it } from "vitest";
import { createMediaWatchTracker } from "./mediaWatchTracker";

/** Feed a continuous stretch of playback in 1s steps, starting just after `from`. */
function play(tracker: ReturnType<typeof createMediaWatchTracker>, from: number, to: number) {
    for (let t = from; t <= to; t++) tracker.track(t);
}

describe("createMediaWatchTracker", () => {
    it("claims a completion once the watched fraction reaches the threshold", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 74);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(false);

        play(tracker, 75, 75);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(true);
    });

    it("claims the completion at most once per playback", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 80);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(true);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(false);
        // The `ended` handler's claim, after the threshold already fired.
        expect(tracker.claimCompletion()).toBe(false);
    });

    it("does not count time skipped over by scrubbing", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 10);
        tracker.track(99); // scrubbed to the end
        tracker.track(100);

        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(false);
    });

    it("never completes on an unknown or live duration", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 200);

        expect(tracker.claimCompletionIfWatched(Infinity, 75)).toBe(false);
        expect(tracker.claimCompletionIfWatched(NaN, 75)).toBe(false);
        expect(tracker.claimCompletionIfWatched(0, 75)).toBe(false);
    });

    it("never completes on a missing or non-finite threshold", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 100);

        expect(tracker.claimCompletionIfWatched(100, undefined as unknown as number)).toBe(false);
        expect(tracker.claimCompletionIfWatched(100, NaN)).toBe(false);
        expect(tracker.claimCompletionIfWatched(100, 0)).toBe(false);
        // Still unclaimed, so a real threshold can fire afterwards.
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(true);
    });

    it("still lets `ended` claim a completion the threshold never reached", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 10);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(false);
        expect(tracker.claimCompletion()).toBe(true);
    });

    it("re-arms after a reset so a replay can complete again", () => {
        const tracker = createMediaWatchTracker();

        play(tracker, 0, 80);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(true);

        tracker.reset();
        play(tracker, 0, 80);
        expect(tracker.claimCompletionIfWatched(100, 75)).toBe(true);
    });
});
