import { onMounted, onUnmounted, ref, type Ref } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { KEYBOARD_PAN_STEP } from "./types";

type FlowControls = Pick<
    ReturnType<typeof useVueFlow>,
    "fitView" | "getViewport" | "setViewport" | "zoomIn" | "zoomOut"
>;

type InteractionOptions = {
    graphRoot: Ref<HTMLElement | null>;
    isFullscreen: Ref<boolean>;
    flow: FlowControls;
    onClearFocus: () => void;
    onOpenSearch: () => void;
    onCloseSearch: () => void;
    isSearchOpen: () => boolean;
};

/**
 * Owns the graph's interaction mode (select vs drag) and all keyboard/pointer
 * handling: temporary mode switching (hold Space / middle mouse), keyboard zoom/pan,
 * global shortcuts (Cmd/Ctrl+K search, Cmd/Ctrl+F fullscreen, Esc), and the
 * window-level listeners for those.
 */
export function useGroupGraphInteraction(opts: InteractionOptions) {
    const {
        graphRoot,
        isFullscreen,
        flow,
        onClearFocus,
        onOpenSearch,
        onCloseSearch,
        isSearchOpen,
    } = opts;
    const { fitView, getViewport, setViewport, zoomIn, zoomOut } = flow;

    const interactionMode = ref<"select" | "drag">("drag");
    const interactionModeBeforeTemporaryDrag = ref<"select" | "drag" | null>(null);

    function handleGlobalKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && isSearchOpen()) {
            event.preventDefault();
            onCloseSearch();
            return;
        }

        if (!(event.metaKey || event.ctrlKey) || !graphRoot.value?.isConnected) return;

        if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            isFullscreen.value = true;
            return;
        }

        if (event.key.toLowerCase() === "k") {
            event.preventDefault();
            onOpenSearch();
            return;
        }
    }

    function isSpaceKey(event: KeyboardEvent) {
        return event.code === "Space" || event.key === " ";
    }

    function startTemporaryMode(mode: "select" | "drag") {
        interactionModeBeforeTemporaryDrag.value ??= interactionMode.value;
        interactionMode.value = mode;
    }

    function startTemporaryDragMode() {
        startTemporaryMode("drag");
    }

    function stopTemporaryDragMode() {
        if (!interactionModeBeforeTemporaryDrag.value) return;

        interactionMode.value = interactionModeBeforeTemporaryDrag.value;
        interactionModeBeforeTemporaryDrag.value = null;
    }

    function startSpaceDragMode(event: KeyboardEvent) {
        if (event.target instanceof HTMLInputElement || !isSpaceKey(event) || event.repeat) return;

        event.preventDefault();
        event.stopPropagation();
        startTemporaryMode(interactionMode.value === "drag" ? "select" : "drag");
    }

    function stopSpaceDragMode(event: KeyboardEvent) {
        if (isSpaceKey(event)) stopTemporaryDragMode();
    }

    function startMiddleMouseDragMode(event: PointerEvent) {
        if (event.button !== 1) return;

        startTemporaryDragMode();
    }

    function stopMiddleMouseDragMode(event: PointerEvent) {
        if (event.button === 1) stopTemporaryDragMode();
    }

    function handleGraphKeydown(event: KeyboardEvent) {
        if (event.target instanceof HTMLInputElement) return;
        startSpaceDragMode(event);

        if (event.key === "Escape") {
            event.preventDefault();
            if (isFullscreen.value) {
                isFullscreen.value = false;
                return;
            }
            onClearFocus();
            return;
        }

        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            event.stopPropagation();
            zoomIn({ duration: 80 });
            return;
        }

        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            event.stopPropagation();
            zoomOut({ duration: 80 });
            return;
        }

        if (event.key === "0") {
            event.preventDefault();
            event.stopPropagation();
            fitView({ padding: 0.18, duration: 120 });
            return;
        }

        const pan = {
            ArrowUp: { x: 0, y: KEYBOARD_PAN_STEP },
            ArrowDown: { x: 0, y: -KEYBOARD_PAN_STEP },
            ArrowLeft: { x: KEYBOARD_PAN_STEP, y: 0 },
            ArrowRight: { x: -KEYBOARD_PAN_STEP, y: 0 },
        }[event.key];

        if (!pan) return;

        event.preventDefault();
        event.stopPropagation();
        const viewport = getViewport();
        setViewport(
            { ...viewport, x: viewport.x + pan.x, y: viewport.y + pan.y },
            { duration: 80 },
        );
    }

    onMounted(() => {
        window.addEventListener("keydown", handleGlobalKeydown);
        window.addEventListener("keyup", stopSpaceDragMode);
        window.addEventListener("pointerup", stopMiddleMouseDragMode);
    });
    onUnmounted(() => {
        window.removeEventListener("keydown", handleGlobalKeydown);
        window.removeEventListener("keyup", stopSpaceDragMode);
        window.removeEventListener("pointerup", stopMiddleMouseDragMode);
    });

    return {
        interactionMode,
        handleGraphKeydown,
        stopSpaceDragMode,
        startMiddleMouseDragMode,
        stopMiddleMouseDragMode,
    };
}
