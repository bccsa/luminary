import type { Ref } from "vue";
import { highlightTextInDOM, saveHighlightedContent } from "./highlight";
import {
    showHighlightColors,
    selectedText,
    showActions,
    isInteractingWithMenu,
    isSelecting,
    actionPosition,
} from "./shared";

/**
 * Applies highlighting with the specified color and saves the updated content.
 * Hides the color picker and actions menu after highlighting.
 *
 * @param color - RGBA color string for the highlight
 */
export function highlightSelectedText(
    color: string,
    content: Ref<HTMLElement | undefined>,
    contentId: string,
) {
    highlightTextInDOM(color, content, contentId);
    saveHighlightedContent(content, contentId);
    showHighlightColors.value = false;
    selectedText.value = "";
    showActions.value = false;
}

/**
 * Copies the currently selected text to the system clipboard.
 * Uses the modern Clipboard API with fallback error handling.
 * Hides the actions menu after copying.
 */
export async function copySelectedText() {
    const selection = window.getSelection();
    const text = selection ? selection.toString() : "";
    if (text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    }
    showActions.value = false;
}

/**
 * Updates the selectedText ref when the browser selection changes.
 * Used for monitoring selection state.
 */
export function handleSelectionChange() {
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;
}

/**
 * Hides the actions menu when selection is cleared.
 * Prevents the menu from staying visible after deselection.
 */
export function onSelectionChange() {
    const selection = window.getSelection();
    if (!selection) return;
    const selText = selection.rangeCount > 0 ? selection.toString() : "";
    selectedText.value = selText;

    // Don't hide the menu if we're interacting with it or currently selecting or menu is showing
    if (!selText && !isInteractingWithMenu.value && !isSelecting.value && !showActions.value) {
        showActions.value = false;
        actionPosition.value = undefined;
    }
}
