import { ref, type Ref } from "vue";
import {
    isSelecting,
    autoScrollInterval,
    longPressTimer,
    showActions,
    actionPosition,
} from "./shared";

// Constants
const LONG_PRESS_DURATION = 500;
const SCROLL_INTERVAL = 16;
const SCROLL_SPEED = 5;
const SCROLL_THRESHOLD_TOP = 150;
const SCROLL_THRESHOLD_BOTTOM = 120;
const MENU_WIDTH = 200;
const MENU_HEIGHT = 100;

function clearTimer(timer: Ref<number | undefined>) {
    if (timer.value) {
        clearTimeout(timer.value);
        timer.value = undefined;
    }
}

function clearIntervalRef(interval: Ref<number | undefined>) {
    if (interval.value) {
        clearInterval(interval.value);
        interval.value = undefined;
    }
}

/** Whether long press was triggered */
const isLongPress = ref(false);

/** Store the initial touch position for selection */
const initialTouch = ref<{ x: number; y: number } | null>(null);

/** Store the current selection range during touch */
const touchSelection = ref<Range | null>(null);

function updateSelection(initialRange: Range, currentRange: Range) {
    const selection = window.getSelection();
    if (!selection) return;
    try {
        const comparison = initialRange.compareBoundaryPoints(Range.START_TO_START, currentRange);
        const range = document.createRange();
        if (comparison <= 0) {
            range.setStart(initialRange.startContainer, initialRange.startOffset);
            range.setEnd(currentRange.endContainer, currentRange.endOffset);
        } else {
            range.setStart(currentRange.startContainer, currentRange.startOffset);
            range.setEnd(initialRange.endContainer, initialRange.endOffset);
        }
        selection.removeAllRanges();
        selection.addRange(range);
    } catch {
        // Ignore selection errors
    }
}

/**
 * Handle touch start events to ensure text selection works on mobile
 */
export function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    initialTouch.value = { x: touch.clientX, y: touch.clientY };
    isSelecting.value = false;
    isLongPress.value = false;
    touchSelection.value = null;
    clearIntervalRef(autoScrollInterval);
    clearTimer(longPressTimer);
    longPressTimer.value = window.setTimeout(() => {
        isLongPress.value = true;
        navigator.vibrate?.(50);
    }, LONG_PRESS_DURATION);
}

/**
 * Handle touch move events to ensure text selection works on mobile
 */
export function onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1 || !initialTouch.value) return;
    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - initialTouch.value.x);
    const deltaY = Math.abs(touch.clientY - initialTouch.value.y);
    if ((deltaX > 10 || deltaY > 10) && longPressTimer.value && !isLongPress.value) {
        clearTimer(longPressTimer);
        return;
    }
    if (!(isLongPress.value && (deltaX > 5 || deltaY > 5))) return;
    event.preventDefault();
    if (!isSelecting.value) {
        isSelecting.value = true;
        const startRange = document.caretRangeFromPoint(initialTouch.value.x, initialTouch.value.y);
        if (startRange) {
            touchSelection.value = startRange;
            window.getSelection()?.removeAllRanges();
            window.getSelection()?.addRange(startRange);
        }
    }
    const currentRange = document.caretRangeFromPoint(touch.clientX, touch.clientY);
    if (currentRange && touchSelection.value) updateSelection(touchSelection.value, currentRange);
    clearIntervalRef(autoScrollInterval);
    const viewportHeight = window.innerHeight;
    const touchY = touch.clientY;
    if (touchY < SCROLL_THRESHOLD_TOP || touchY > viewportHeight - SCROLL_THRESHOLD_BOTTOM) {
        autoScrollInterval.value = window.setInterval(() => {
            window.scrollBy(0, touchY < SCROLL_THRESHOLD_TOP ? -SCROLL_SPEED : SCROLL_SPEED);
            if (touchSelection.value && initialTouch.value) {
                const currentRange = document.caretRangeFromPoint(touch.clientX, touch.clientY);
                if (currentRange) updateSelection(touchSelection.value, currentRange);
            }
        }, SCROLL_INTERVAL);
    }
}

export function onTouchEnd(event: TouchEvent, content: Ref<HTMLElement | undefined>) {
    clearTimer(longPressTimer);
    clearIntervalRef(autoScrollInterval);
    if (!isSelecting.value) {
        initialTouch.value = null;
        touchSelection.value = null;
        isLongPress.value = false;
        return;
    }
    isSelecting.value = false;
    const selection = window.getSelection();
    const selText = selection && selection.rangeCount > 0 ? selection.toString() : "";
    if (!(selText && content.value)) {
        initialTouch.value = null;
        touchSelection.value = null;
        isLongPress.value = false;
        return;
    }
    const contentRect = content.value.getBoundingClientRect();
    let menuX = 0,
        menuY = 0;
    try {
        const rangeRect = selection!.getRangeAt(0).getBoundingClientRect();
        menuX = rangeRect.left - contentRect.left;
        menuY = rangeRect.bottom - contentRect.top + 4;
    } catch {
        const touch = event.changedTouches[0];
        menuX = touch.clientX - contentRect.left;
        menuY = touch.clientY - contentRect.top + 16;
    }
    // Adjust position to prevent clipping off screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const absoluteX = contentRect.left + menuX;
    if (absoluteX + MENU_WIDTH > viewportWidth)
        menuX = viewportWidth - contentRect.left - MENU_WIDTH - 10;
    if (menuX < 0) menuX = 10;
    const absoluteY = contentRect.top + menuY;
    if (absoluteY + MENU_HEIGHT > viewportHeight) {
        try {
            const rangeRect = selection!.getRangeAt(0).getBoundingClientRect();
            menuY = rangeRect.top - contentRect.top - MENU_HEIGHT - 4;
        } catch {
            menuY = menuY - MENU_HEIGHT - 20;
        }
    }
    if (contentRect.top + menuY < 0) menuY = -contentRect.top + 10;
    showActions.value = true;
    actionPosition.value = { x: menuX, y: menuY };
    initialTouch.value = null;
    touchSelection.value = null;
    isLongPress.value = false;
}
