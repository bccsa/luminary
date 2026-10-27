import { onBeforeUnmount, onMounted } from "vue";

const EDITABLE_SELECTOR =
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], label';

function isEditable(element: Element): element is HTMLElement {
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
    if (element instanceof HTMLInputElement)
        return !["button", "submit", "checkbox", "radio", "range"].includes(element.type);
    return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Closes the on-screen keyboard when a touch starts outside the field being typed in, as a native app
 * does. iOS leaves a field focused, and its keyboard open, when the touch lands on something that
 * cannot take focus. A field's own controls (a clear or Go button) sit inside an element marked
 * `data-keeps-keyboard` and leave it open.
 */
export function useDismissKeyboardOnTouch() {
    function onTouchStart(event: TouchEvent) {
        const active = document.activeElement;
        if (!active || !isEditable(active)) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || active.contains(target)) return;
        // Another field, or a label for one, takes the focus itself.
        if (target.closest(EDITABLE_SELECTOR)) return;
        if (active.closest("[data-keeps-keyboard]")?.contains(target)) return;
        active.blur();
    }

    onMounted(() =>
        document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true }),
    );
    onBeforeUnmount(() =>
        document.removeEventListener("touchstart", onTouchStart, { capture: true }),
    );
}
