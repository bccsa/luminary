/**
 * Tracks how much of a video/audio track was actually played, so a near-complete watch
 * counts as a completion. The media element's `ended` event alone misses these — few
 * people sit through outros and end credits.
 */

/**
 * Longest gap between two `timeupdate` positions that still counts as playback. Anything
 * larger is a seek, so scrubbing towards the end adds no watched time.
 */
const MAX_PLAYBACK_STEP_SECONDS = 2;

export type MediaWatchTracker = {
    /** Feed the current playback position on every `timeupdate`. */
    track: (position: number) => void;
    /**
     * True the first time the played fraction reaches `thresholdPercent` of `duration`.
     * An unknown or live duration, or a missing threshold, never qualifies.
     */
    claimCompletionIfWatched: (duration: number, thresholdPercent: number) => boolean;
    /**
     * Claim this playback's one completion outright (the `ended` event), so a track that
     * already crossed the threshold isn't counted twice.
     */
    claimCompletion: () => boolean;
    /** Start over — a new track, or a replay of the same one. */
    reset: () => void;
};

export function createMediaWatchTracker(): MediaWatchTracker {
    let watchedSeconds = 0;
    let lastPosition: number | undefined;
    let completionClaimed = false;

    const claimCompletion = () => {
        if (completionClaimed) return false;
        completionClaimed = true;
        return true;
    };

    return {
        track(position) {
            if (!Number.isFinite(position)) return;
            const previous = lastPosition;
            lastPosition = position;
            if (previous === undefined) return;
            const step = position - previous;
            if (step > 0 && step <= MAX_PLAYBACK_STEP_SECONDS) watchedSeconds += step;
        },
        claimCompletionIfWatched(duration, thresholdPercent) {
            if (completionClaimed) return false;
            if (!Number.isFinite(duration) || duration <= 0) return false;
            if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0) return false;
            if (watchedSeconds / duration < thresholdPercent / 100) return false;
            return claimCompletion();
        },
        claimCompletion,
        reset() {
            watchedSeconds = 0;
            lastPosition = undefined;
            completionClaimed = false;
        },
    };
}
