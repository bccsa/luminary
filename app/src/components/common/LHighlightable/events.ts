import type { Ref } from "vue";
import {
    isInteractingWithMenu,
    showActions,
    selectedText,
    actionPosition,
    actionsMenu,
    showHighlightColors,
} from "./shared";

/**
 * Marks the beginning of menu interaction to prevent it from disappearing
 */
export function onMenuPointerDown() {
    isInteractingWithMenu.value = true;
}

/**
 * Handle document-wide clicks to implement a click-outside pattern
 */
export function onDocumentClick(event: MouseEvent | TouchEvent) {
    console.log(
        "onDocumentClick called",
        "showActions:",
        showActions.value,
        "target:",
        event.target,
    );
    // If menu is shown and click is outside the menu, hide it
    if (
        showActions.value &&
        actionsMenu.value &&
        !actionsMenu.value.contains(event.target as Node) &&
        !isInteractingWithMenu.value
    ) {
        console.log("Hiding menu in onDocumentClick");
        showActions.value = false;
        showHighlightColors.value = false;
    }

    // Reset the interaction flag
    isInteractingWithMenu.value = false;
}

/**
 * Handles pointer and touch input to show the actions menu.
 * Positions the menu near the cursor or last touch point.
 *
 * @param event - PointerEvent or TouchEvent from the interaction
 */
export function onPointerUp(event: PointerEvent | TouchEvent, content: Ref<HTMLElement | null>) {
    console.log("onPointerUp called", event.type);
    // Reset the interaction flag when touching outside the menu
    if (actionsMenu.value && !actionsMenu.value.contains(event.target as Node)) {
        isInteractingWithMenu.value = false;
    }

    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    console.log("Selected text:", selText);
    selectedText.value = selText;

    if (selText && content.value) {
        console.log("Showing actions menu");
        const contentRect = content.value.getBoundingClientRect();

        // Try to position based on selection bounds first, fallback to event coordinates
        let menuX = 0;
        let menuY = 0;

        if (selection) {
            try {
                const range = selection.getRangeAt(0);
                const rangeRect = range.getBoundingClientRect();
                menuX = rangeRect.left - contentRect.left;
                menuY = rangeRect.bottom - contentRect.top + 4;
                console.log("Menu position from selection:", menuX, menuY);
            } catch (e) {
                console.log("Error getting selection bounds:", e);
                // Fallback to event coordinates
                let clientX = 0;
                let clientY = 0;

                if (event instanceof PointerEvent) {
                    clientX = event.clientX;
                    clientY = event.clientY;
                } else if (event instanceof TouchEvent) {
                    const touch = event.changedTouches[0];
                    clientX = touch.clientX;
                    clientY = touch.clientY;
                }

                menuX = clientX - contentRect.left;
                menuY = clientY - contentRect.top + 16;
                console.log("Menu position from event:", menuX, menuY);
            }
        } else {
            console.log("No selection object");
            // Fallback to event coordinates
            let clientX = 0;
            let clientY = 0;

            if (event instanceof PointerEvent) {
                clientX = event.clientX;
                clientY = event.clientY;
            } else if (event instanceof TouchEvent) {
                const touch = event.changedTouches[0];
                clientX = touch.clientX;
                clientY = touch.clientY;
            }

            menuX = clientX - contentRect.left;
            menuY = clientY - contentRect.top + 16;
            console.log("Menu position from event fallback:", menuX, menuY);
        }

        // Adjust position to prevent clipping off screen
        const menuWidth = 200; // approximate width of menu
        const menuHeight = 100; // approximate height of menu
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust X to prevent right edge clipping
        const absoluteX = contentRect.left + menuX;
        if (absoluteX + menuWidth > viewportWidth) {
            menuX = viewportWidth - contentRect.left - menuWidth - 10; // 10px margin
        }
        // Prevent left edge clipping
        if (menuX < 0) {
            menuX = 10;
        }

        // Adjust Y to prevent bottom clipping
        const absoluteY = contentRect.top + menuY;
        if (absoluteY + menuHeight > viewportHeight) {
            // Position above the selection instead
            if (selection) {
                try {
                    const range = selection.getRangeAt(0);
                    const rangeRect = range.getBoundingClientRect();
                    menuY = rangeRect.top - contentRect.top - menuHeight - 4;
                } catch (e) {
                    menuY = menuY - menuHeight - 20;
                }
            }
        }
        // Prevent top clipping
        if (contentRect.top + menuY < 0) {
            menuY = -contentRect.top + 10;
        }

        showActions.value = true;
        actionPosition.value = {
            x: menuX,
            y: menuY,
        };
        console.log("SET showActions to true in onPointerUp");
    } else {
        console.log("Not showing menu - no selected text or no content");
        if (!isInteractingWithMenu.value) {
            // Only hide if we're not interacting with the menu
            showActions.value = false;
            actionPosition.value = undefined;
        }
    }
}
