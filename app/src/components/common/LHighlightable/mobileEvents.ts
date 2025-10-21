import { ref, type Ref } from "vue";
import {
    isSelecting,
    autoScrollInterval,
    longPressTimer,
    showActions,
    actionPosition,
} from "./shared";

/** Whether long press was triggered */
const isLongPress = ref(false);

/** Store the initial touch position for selection */
const initialTouch = ref<{ x: number; y: number } | null>(null);

/** Store the current selection range during touch */
const touchSelection = ref<Range | null>(null);

/**
 * Handle touch start events to ensure text selection works on mobile
 */
export function onTouchStart(event: TouchEvent) {
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        initialTouch.value = { x: touch.clientX, y: touch.clientY };
        isSelecting.value = false;
        isLongPress.value = false;
        touchSelection.value = null;

        // Stop any existing auto-scroll when starting a new touch
        if (autoScrollInterval.value) {
            clearInterval(autoScrollInterval.value);
            autoScrollInterval.value = undefined;
        }

        // Clear any existing long press timer
        if (longPressTimer.value) {
            clearTimeout(longPressTimer.value);
            longPressTimer.value = undefined;
        }

        // Start long press timer (500ms)
        longPressTimer.value = window.setTimeout(() => {
            isLongPress.value = true;
            // Optionally provide haptic feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 500);
    }
}

/**
 * Handle touch move events to ensure text selection works on mobile
 */
export function onTouchMove(event: TouchEvent) {
    if (event.touches.length === 1 && initialTouch.value) {
        const touch = event.touches[0];
        const deltaX = Math.abs(touch.clientX - initialTouch.value.x);
        const deltaY = Math.abs(touch.clientY - initialTouch.value.y);

        // If moved significantly, cancel long press timer (user is scrolling)
        if ((deltaX > 10 || deltaY > 10) && longPressTimer.value && !isLongPress.value) {
            clearTimeout(longPressTimer.value);
            longPressTimer.value = undefined;
            // Allow normal scrolling - don't preventDefault
            return;
        }

        // Only enable selection if long press was triggered
        if (isLongPress.value && (deltaX > 5 || deltaY > 5)) {
            // Prevent default scrolling during text selection - this stops manual scrolling
            event.preventDefault();

            if (!isSelecting.value) {
                isSelecting.value = true;
                // Start selection at initial touch point
                const startRange = document.caretRangeFromPoint(
                    initialTouch.value.x,
                    initialTouch.value.y,
                );
                if (startRange) {
                    touchSelection.value = startRange;
                    const selection = window.getSelection();
                    if (selection) {
                        selection.removeAllRanges();
                        selection.addRange(startRange);
                    }
                }
            }

            // Update selection to current touch point
            const currentRange = document.caretRangeFromPoint(touch.clientX, touch.clientY);
            if (currentRange && touchSelection.value) {
                const selection = window.getSelection();
                if (selection) {
                    try {
                        // Compare positions to determine selection direction
                        const initialRange = touchSelection.value;
                        const currentPos = document.createRange();
                        currentPos.setStart(currentRange.startContainer, currentRange.startOffset);
                        currentPos.setEnd(currentRange.endContainer, currentRange.endOffset);

                        const comparison = initialRange.compareBoundaryPoints(
                            Range.START_TO_START,
                            currentPos,
                        );

                        const range = document.createRange();
                        if (comparison <= 0) {
                            // Dragging forwards: initial is start, current is end
                            range.setStart(initialRange.startContainer, initialRange.startOffset);
                            range.setEnd(currentRange.endContainer, currentRange.endOffset);
                        } else {
                            // Dragging backwards: current is start, initial is end
                            range.setStart(currentRange.startContainer, currentRange.startOffset);
                            range.setEnd(initialRange.endContainer, initialRange.endOffset);
                        }

                        selection.removeAllRanges();
                        selection.addRange(range);
                    } catch (e) {
                        // Ignore errors during selection update
                    }
                }
            }

            // Auto-scroll when near the edges during selection
            const scrollThresholdTop = 150; // pixels from top to trigger scroll (accounting for top bar)
            const scrollThresholdBottom = 120; // pixels from bottom to trigger scroll (accounting for bottom bar)
            const scrollSpeed = 5;

            if (autoScrollInterval.value) {
                clearInterval(autoScrollInterval.value);
                autoScrollInterval.value = undefined;
            }

            const viewportHeight = window.innerHeight;
            const touchY = touch.clientY;

            if (touchY < scrollThresholdTop) {
                autoScrollInterval.value = window.setInterval(() => {
                    window.scrollBy(0, -scrollSpeed);
                    // Update selection after scroll
                    if (touchSelection.value && initialTouch.value) {
                        const currentRange = document.caretRangeFromPoint(
                            touch.clientX,
                            touch.clientY,
                        );
                        if (currentRange) {
                            const selection = window.getSelection();
                            if (selection) {
                                try {
                                    const initialRange = touchSelection.value;
                                    const comparison = initialRange.compareBoundaryPoints(
                                        Range.START_TO_START,
                                        currentRange,
                                    );
                                    const range = document.createRange();
                                    if (comparison <= 0) {
                                        range.setStart(
                                            initialRange.startContainer,
                                            initialRange.startOffset,
                                        );
                                        range.setEnd(
                                            currentRange.endContainer,
                                            currentRange.endOffset,
                                        );
                                    } else {
                                        range.setStart(
                                            currentRange.startContainer,
                                            currentRange.startOffset,
                                        );
                                        range.setEnd(
                                            initialRange.endContainer,
                                            initialRange.endOffset,
                                        );
                                    }
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                } catch (e) {
                                    // Ignore errors during scroll
                                }
                            }
                        }
                    }
                }, 16);
            } else if (touchY > viewportHeight - scrollThresholdBottom) {
                autoScrollInterval.value = window.setInterval(() => {
                    window.scrollBy(0, scrollSpeed);
                    // Update selection after scroll
                    if (touchSelection.value && initialTouch.value) {
                        const currentRange = document.caretRangeFromPoint(
                            touch.clientX,
                            touch.clientY,
                        );
                        if (currentRange) {
                            const selection = window.getSelection();
                            if (selection) {
                                try {
                                    const initialRange = touchSelection.value;
                                    const comparison = initialRange.compareBoundaryPoints(
                                        Range.START_TO_START,
                                        currentRange,
                                    );
                                    const range = document.createRange();
                                    if (comparison <= 0) {
                                        range.setStart(
                                            initialRange.startContainer,
                                            initialRange.startOffset,
                                        );
                                        range.setEnd(
                                            currentRange.endContainer,
                                            currentRange.endOffset,
                                        );
                                    } else {
                                        range.setStart(
                                            currentRange.startContainer,
                                            currentRange.startOffset,
                                        );
                                        range.setEnd(
                                            initialRange.endContainer,
                                            initialRange.endOffset,
                                        );
                                    }
                                    selection.removeAllRanges();
                                    selection.addRange(range);
                                } catch (e) {
                                    // Ignore errors during scroll
                                }
                            }
                        }
                    }
                }, 16);
            }
        }
    }
}

export function onTouchEnd(event: TouchEvent, content: Ref<HTMLElement | undefined>) {
    // Clear long press timer
    if (longPressTimer.value) {
        clearTimeout(longPressTimer.value);
        longPressTimer.value = undefined;
    }

    // Stop auto-scrolling
    if (autoScrollInterval.value) {
        clearInterval(autoScrollInterval.value);
        autoScrollInterval.value = undefined;
    }

    if (isSelecting.value) {
        isSelecting.value = false;

        // Check if there's selected text and show menu
        const selection = window.getSelection();
        const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";

        if (selText && content.value) {
            const contentRect = content.value.getBoundingClientRect();

            // Position based on selection bounds or touch point
            let menuX = 0;
            let menuY = 0;

            if (selection) {
                try {
                    const range = selection.getRangeAt(0);
                    const rangeRect = range.getBoundingClientRect();
                    menuX = rangeRect.left - contentRect.left;
                    menuY = rangeRect.bottom - contentRect.top + 4;
                } catch (e) {
                    const touch = event.changedTouches[0];
                    menuX = touch.clientX - contentRect.left;
                    menuY = touch.clientY - contentRect.top + 16;
                }
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
        }
    }
    initialTouch.value = null;
    touchSelection.value = null;
    isLongPress.value = false;
}
