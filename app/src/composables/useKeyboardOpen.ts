import { onBeforeUnmount, onMounted, ref } from "vue";

/** How much shorter than its tallest the viewport must get, in CSS pixels, to count as a keyboard. */
const KEYBOARD_MIN_PX = 150;

/** Whether the on-screen keyboard is up: shared, so the fixed bars can step aside for it. */
export const keyboardOpen = ref(false);

/**
 * Tracks the on-screen keyboard from the viewport's height, which is what shrinks (the page's on Android, the visual
 * viewport on iOS), while a field has the focus. Mount once, at the app's root.
 */
export function useKeyboardOpen() {
    let tallest = 0;

    function editableFocused(): boolean {
        const active = document.activeElement;
        return (
            active instanceof HTMLInputElement ||
            active instanceof HTMLTextAreaElement ||
            (active instanceof HTMLElement && active.isContentEditable)
        );
    }

    function update() {
        const height = Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity);
        // A turn changes the height without a keyboard: the tallest is only trusted while nothing is typed in.
        if (!editableFocused() || height > tallest) tallest = Math.max(tallest, height);
        if (!editableFocused()) tallest = height;
        keyboardOpen.value = editableFocused() && tallest - height > KEYBOARD_MIN_PX;
    }

    onMounted(() => {
        update();
        window.addEventListener("resize", update);
        window.visualViewport?.addEventListener("resize", update);
        document.addEventListener("focusin", update);
        document.addEventListener("focusout", update);
    });
    onBeforeUnmount(() => {
        window.removeEventListener("resize", update);
        window.visualViewport?.removeEventListener("resize", update);
        document.removeEventListener("focusin", update);
        document.removeEventListener("focusout", update);
        keyboardOpen.value = false;
    });
}
