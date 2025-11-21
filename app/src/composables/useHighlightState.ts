import { ref } from "vue";

/** Currently selected text across all highlightable components */
const selectedText = ref("");

/** Flag to track if we're currently interacting with the menu */
const isInteractingWithMenu = ref(false);

/** Flag to track if we're currently in a touch selection */
const isSelecting = ref(false);

/** Controls visibility of the actions menu (highlight/copy buttons) */
const showActions = ref(false);

/** Position of the actions menu relative to the content container */
const actionPosition = ref<{ x: number; y: number } | undefined>(undefined);

/** Controls visibility of the color picker */
const showHighlightColors = ref(false);

/** Flag to prevent immediate menu dismissal after showing it */
const justShownMenu = ref(false);

/** Whether long press was triggered */
const isLongPress = ref(false);

/** Store the initial touch position for selection */
const initialTouch = ref<{ x: number; y: number } | null>(null);

/** Store the current selection range during touch */
const touchSelection = ref<Range | null>(null);

export function useHighlightState() {
    return {
        selectedText,
        isInteractingWithMenu,
        isSelecting,
        showActions,
        actionPosition,
        showHighlightColors,
        justShownMenu,
        isLongPress,
        initialTouch,
        touchSelection,
    };
}
