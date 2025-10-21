import { ref } from "vue";

/** Currently selected text */
export const selectedText = ref("");

/** Flag to track if we're currently interacting with the menu */
export const isInteractingWithMenu = ref(false);

/** Flag to track if we're currently in a touch selection */
export const isSelecting = ref(false);

/** Controls visibility of the actions menu (highlight/copy buttons) */
export const showActions = ref(false);

/** Long press timer */
export const longPressTimer = ref<number | undefined>(undefined);

/** Auto-scroll interval ID */
export const autoScrollInterval = ref<number | undefined>(undefined);

/** Position of the actions menu relative to the content container */
export const actionPosition = ref<{ x: number; y: number } | undefined>(undefined);

/** Reference to the actions menu DOM element */
export const actionsMenu = ref<HTMLElement | undefined>(undefined);

/** Controls visibility of the color picker */
export const showHighlightColors = ref(false);

/** Flag to prevent immediate menu dismissal after showing it */
export const justShownMenu = ref(false);
