/**
 * The silent-audio keep-alive.
 *
 * iOS and Safari tear down a page's audio session the moment nothing is
 * playing, and re-establishing it needs a user gesture. Switching to the
 * audio-only angle re-sources the player, which is a gap in playback with no
 * gesture behind it — so the session dies mid-switch and the audio comes back
 * silent until the viewer taps something.
 *
 * A hidden muted `<audio>` looping a fraction of a second of silence, played and
 * paused in lockstep with the real playback, keeps that session open across the
 * gap. Muted, so it is inaudible; looping, so it never ends and lets go.
 *
 * Ported from the Luminary app, which ships the same silence as a `.wav` asset;
 * here it is inlined so the package needs no asset pipeline.
 */

/**
 * ~1.6 s of 16-bit 44.1 kHz mono silence as a `data:` URI (244 bytes).
 *
 * A real RIFF/WAVE file rather than the shortest one that decodes: Safari has
 * refused zero-sample and header-only WAVs, and a keep-alive that fails to load
 * fails silently — the symptom shows up as mute audio on one platform, weeks
 * later.
 */
export const SILENT_AUDIO_DATA_URI =
    'data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/** Play/pause lockstep over one hidden `<audio>` element. */
export interface KeepAlive {
    /**
     * Mirrors the real player's transport. `true` starts the silence, `false`
     * pauses it.
     *
     * Rejection is swallowed: without a prior gesture the browser refuses, and
     * that is precisely the case where there is no audio session worth keeping
     * open anyway.
     */
    sync(playing: boolean): void;
    /** Stops and rewinds. Called when the player is torn down. */
    dispose(): void;
}

/** Wraps the hidden element the component renders. A null element is a no-op. */
export function createKeepAlive(element: HTMLAudioElement | null | undefined): KeepAlive {
    return {
        sync(playing: boolean): void {
            if (!element) return;
            if (playing) {
                void element.play()?.catch(() => {
                    /* no gesture yet, or the tab is backgrounded — nothing to keep alive */
                });
            } else {
                element.pause();
            }
        },
        dispose(): void {
            if (!element) return;
            element.pause();
            element.currentTime = 0;
        },
    };
}
