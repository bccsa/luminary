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
    controlsVisible: boolean;
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

    /**
     * A touch tap is v10's to toggle the controls with, and a held lock keeps them up whatever it decides: so the
     * lock is not taken on a finger's down, is given back before v10 sees the up, and is taken again only if the
     * tap left the controls showing. A finger's movement only keeps controls up that are already showing.
     */
    let afterTouch: ReturnType<typeof setTimeout> | undefined;
    const keepIfShowing = (): void => {
        if (getStore()?.controlsVisible) onActivity();
    };
    const onPointer = (event: Event): void => {
        if ((event as PointerEvent).pointerType !== "touch") onActivity();
        else if (event.type === "pointermove") keepIfShowing();
        else if (event.type === "pointerup") {
            // Taken after v10's own pointerup listeners have toggled the controls.
            clearTimeout(afterTouch);
            afterTouch = setTimeout(keepIfShowing);
        }
    };
    const onTouchUpFirst = (event: Event): void => {
        if ((event as PointerEvent).pointerType !== "touch") return;
        release?.();
        release = undefined;
    };

    for (const type of ACTIVITY) target.addEventListener(type, onPointer, { passive: true });
    target.addEventListener("pointerup", onTouchUpFirst, { capture: true, passive: true });

    return () => {
        if (timer) clearTimeout(timer);
        timer = undefined;
        clearTimeout(afterTouch);
        release?.();
        release = undefined;
        for (const type of ACTIVITY) target.removeEventListener(type, onPointer);
        target.removeEventListener("pointerup", onTouchUpFirst, { capture: true });
    };
}
