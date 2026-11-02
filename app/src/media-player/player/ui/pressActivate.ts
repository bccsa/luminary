/**
 * The media buttons act when they are pressed, not when they are let go: a button that waits for the release
 * feels a beat late on a transport control. Video.js 10's buttons, like a plain `<button>`, act on `click`, so the
 * press is turned into that click and the click the release brings afterwards is swallowed.
 *
 * Only the transport buttons do this. Whatever opens a card (a menu, or the volume card the mute button opens) stays
 * on `click`, since a popover opened on the press is light-dismissed by its own release, and so does a menu row, which
 * a finger scrolling its list must not pick.
 */

/** How a button may be pressed into acting. */
type PressKind = "any" | "play" | "activation";

/**
 * Fullscreen and picture-in-picture need a user activation, which a touch only grants on its release, so a
 * finger keeps them on `click`. So does a first play, which needs one to start with sound.
 */
const PRESS_BUTTONS: readonly (readonly [string, PressKind])[] = [
    ['media-fullscreen-button, media-pip-button, [data-lmpl-press="activation"]', "activation"],
    ['media-play-button, [data-lmpl-press="play"]', "play"],
    ['media-seek-button, [data-volume-step], [data-lmpl-press=""]', "any"],
];

const PRESS_SELECTOR = PRESS_BUTTONS.map(([selector]) => selector).join(", ");

/** The button a press lands on and how it may be pressed, or `null` when it is not a media button. */
export function pressTarget(
    target: EventTarget | null,
): { button: HTMLElement; kind: PressKind } | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLElement>(PRESS_SELECTOR);
    if (!button) return null;
    const kind = PRESS_BUTTONS.find(([selector]) => button.matches(selector))?.[1] ?? "any";
    return { button, kind };
}

/** Whether a press of this kind may act now, rather than waiting for its click. */
export function actsOnPress(kind: PressKind, pointerType: string, started: boolean): boolean {
    if (pointerType !== "touch") return true;
    if (kind === "activation") return false;
    return kind === "any" || started;
}

/**
 * Makes the media buttons inside `container` act on the press. `started` says whether the media has played
 * before, after which a touch may play it again without waiting for the release. Returns the teardown.
 */
export function attachPressActivation(container: HTMLElement, started: () => boolean): () => void {
    let pressed: HTMLElement | null = null;
    let clicking = false;

    // Bubble, not capture: what the player does on a press anywhere (closing a menu, ending a scrub) still goes first.
    const onPointerdown = (event: PointerEvent): void => {
        pressed = null;
        if (!event.isPrimary || event.button !== 0) return;
        const hit = pressTarget(event.target);
        if (
            !hit ||
            !container.contains(hit.button) ||
            !actsOnPress(hit.kind, event.pointerType, started())
        )
            return;
        pressed = hit.button;
        // No mousedown, so the button does not take focus: a focused control swallows the host's keys.
        event.preventDefault();
        clicking = true;
        try {
            hit.button.click();
        } finally {
            clicking = false;
        }
    };
    // Only the release's click: the one the press makes must go through.
    const onClick = (event: MouseEvent): void => {
        if (clicking || !pressed) return;
        const button = pressed;
        pressed = null;
        if (!(event.target instanceof Node) || !button.contains(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    // A press that never clicked must not swallow the click a key brings later.
    const forget = (): void => {
        pressed = null;
    };

    container.addEventListener("pointerdown", onPointerdown);
    container.addEventListener("click", onClick, true);
    container.addEventListener("keydown", forget, true);
    return () => {
        container.removeEventListener("pointerdown", onPointerdown);
        container.removeEventListener("click", onClick, true);
        container.removeEventListener("keydown", forget, true);
    };
}
