/**
 * The 3-second control auto-hide.
 *
 * Video.js 10 hides the controls 2 s after the last pointer activity and does not let that be
 * changed. The Luminary app's chrome waits 3 s, so this holds a controls lock — which stops v10's own
 * idle timer — while the pointer is active, and when its own timer runs out releases the lock and
 * hides the controls at once. Releasing alone is not enough: it counts as activity and would start
 * v10's 2 s timer, giving 5 s.
 */

/** How long the controls stay up after the last pointer activity, in milliseconds. */
export const AUTO_HIDE_MS = 3000;

/** The two store actions this needs. */
export interface ControlsStore {
    requestControlsLock(): () => void;
    toggleControls(forceShow?: boolean): boolean;
}

/** Pointer events that count as the viewer being there. */
const ACTIVITY = ["pointermove", "pointerdown", "pointerup"] as const;

/**
 * Starts hiding the controls 3 s after the last pointer activity on `target`. Returns the uninstall
 * function; it clears the pending timer and gives the lock back, because a timer firing after the
 * player is gone calls an action on a dead store. While `shouldHold()` is true the controls stay up.
 */
export function installAutoHide(
    target: HTMLElement,
    getStore: () => ControlsStore | undefined,
    delayMs = AUTO_HIDE_MS,
    shouldHold: () => boolean = () => false,
): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let release: (() => void) | undefined;

    const hide = (): void => {
        timer = undefined;
        // Something on the picture is being read (the pinned roster): the controls wait for it.
        if (shouldHold()) {
            timer = setTimeout(hide, delayMs);
            return;
        }
        const store = getStore();
        release?.();
        release = undefined;
        // Releasing the lock counts as activity; hiding straight after is what makes it 3 s, not 5.
        store?.toggleControls(false);
    };

    const onActivity = (): void => {
        const store = getStore();
        if (!store) return;
        release ??= store.requestControlsLock();
        if (timer) clearTimeout(timer);
        timer = setTimeout(hide, delayMs);
    };

    for (const type of ACTIVITY) target.addEventListener(type, onActivity, { passive: true });

    return () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        release?.();
        release = undefined;
        for (const type of ACTIVITY) target.removeEventListener(type, onActivity);
    };
}
