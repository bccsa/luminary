import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter } from "vue";

export type ShortcutAction =
    | { type: "togglePlay" }
    | { type: "skip"; seconds: number }
    | { type: "seekToFraction"; fraction: number }
    | { type: "volume"; direction: 1 | -1 }
    | { type: "toggleMute" }
    | { type: "toggleFullscreen" }
    | { type: "toggleSubtitles" }
    | { type: "rate"; direction: 1 | -1 }
    | { type: "next" };

export type ShortcutHandlers = {
    [K in ShortcutAction["type"]]: (action: Extract<ShortcutAction, { type: K }>) => void;
};

export const SHORTCUT_SKIP_SECONDS = 10;

/** Keys a focused widget acts on itself: a button presses, a slider or list moves. */
const WIDGET_KEYS = new Set([
    " ",
    "Enter",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
]);
const WIDGET_SELECTOR =
    'button, a[href], select, summary, input, [role="button"], [role="slider"], [role="tab"], [role="menuitem"], [role="option"], [role="radio"], [role="checkbox"]';

function isTyping(target: Element): boolean {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target instanceof HTMLInputElement)
        return !["range", "checkbox", "radio", "button", "submit"].includes(target.type);
    return target instanceof HTMLElement && target.isContentEditable;
}

/** What a key means to the player, or null when it means nothing. */
export function shortcutFor(event: KeyboardEvent): ShortcutAction | null {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    const key = event.key;
    switch (key) {
        case " ":
        case "k":
        case "K":
            return { type: "togglePlay" };
        case "ArrowLeft":
        case "j":
        case "J":
            return { type: "skip", seconds: -SHORTCUT_SKIP_SECONDS };
        case "ArrowRight":
        case "l":
        case "L":
            return { type: "skip", seconds: SHORTCUT_SKIP_SECONDS };
        case "ArrowUp":
            return { type: "volume", direction: 1 };
        case "ArrowDown":
            return { type: "volume", direction: -1 };
        case "m":
        case "M":
            return { type: "toggleMute" };
        case "f":
        case "F":
            return { type: "toggleFullscreen" };
        case "c":
        case "C":
            return { type: "toggleSubtitles" };
        case ">":
            return { type: "rate", direction: 1 };
        case "<":
            return { type: "rate", direction: -1 };
        case "N":
            return event.shiftKey ? { type: "next" } : null;
        case "Home":
            return { type: "seekToFraction", fraction: 0 };
        case "End":
            return { type: "seekToFraction", fraction: 1 };
    }
    if (/^[0-9]$/.test(key)) return { type: "seekToFraction", fraction: Number(key) / 10 };
    return null;
}

/**
 * Whether the page, not the player, should have the key: the viewer is typing, a focused control
 * handles the key itself, or a modal is in front of the player.
 */
export function leaveToPage(event: KeyboardEvent, modalOpen: boolean): boolean {
    if (modalOpen || event.defaultPrevented || event.isComposing) return true;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return false;
    if (isTyping(target)) return true;
    return WIDGET_KEYS.has(event.key) && !!target.closest(WIDGET_SELECTOR);
}

/**
 * The player's keyboard shortcuts, for the whole page while `active`. Listened for on the window in
 * the capture phase, so a handled key is claimed before the page's own handlers see it.
 */
export function useMediaPlayerShortcuts(
    active: MaybeRefOrGetter<boolean>,
    modalOpen: () => boolean,
    handlers: ShortcutHandlers,
) {
    function onKeydown(event: KeyboardEvent) {
        if (leaveToPage(event, modalOpen())) return;
        const action = shortcutFor(event);
        if (!action) return;
        event.preventDefault();
        (handlers[action.type] as (action: ShortcutAction) => void)(action);
    }

    watch(
        () => toValue(active),
        (on) => {
            if (on) window.addEventListener("keydown", onKeydown, true);
            else window.removeEventListener("keydown", onKeydown, true);
        },
        { immediate: true },
    );
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
}
