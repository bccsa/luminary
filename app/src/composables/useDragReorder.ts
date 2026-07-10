import { ref, type Ref } from "vue";

// Pointer events, not HTML5 drag-and-drop: callers are touch-first and DnD never fires on touch.
// The grabbed row tracks the finger with a translate, and every full row of travel splices
// `order` so the neighbours shuffle live underneath it.
//
// `startDrag` puts the handle into pointer capture, so the browser retargets every later
// pointermove/pointerup/pointercancel for that pointer back to the handle regardless of where
// the finger physically ends up — bind `onDragMove`/`endDrag` as plain `v-on` directives on the
// SAME handle element (incl. `@lostpointercapture="endDrag"` as a fallback if the row is ever
// removed mid-drag) rather than adding/removing listeners on `window` by hand.
//
// Not vue-use's `useDraggable`: that tracks one element's free x/y position, it doesn't know
// about a list, row height, or index splicing — the reorder semantics here (clamping to list
// bounds, converting travel into a discrete index swap) would still have to be hand-rolled on
// top of it. `useSortable` (vue-use/integrations, wraps SortableJS) is the closer fit but pulls
// in a new dependency for something ~50 lines already does.
export function useDragReorder(order: Ref<string[]>) {
    const draggingId = ref<string | null>(null);
    const dragTranslate = ref(0);
    let dragStartY = 0;
    let dragStartIndex = 0;
    let rowStep = 0; // px between adjacent row tops (rows are uniform height)

    const endDrag = () => {
        draggingId.value = null;
        dragTranslate.value = 0;
    };

    function onDragMove(e: PointerEvent) {
        const id = draggingId.value;
        if (!id || rowStep <= 0) return; // rowStep is 0 in jsdom (no layout) — drag is a no-op there
        e.preventDefault(); // suppress text selection / touch scroll while dragging
        // Clamp the travel to the list's own bounds, so a row can never be dragged outside it.
        const last = order.value.length - 1;
        const dy = Math.max(
            -dragStartIndex * rowStep,
            Math.min((last - dragStartIndex) * rowStep, e.clientY - dragStartY),
        );
        const target = dragStartIndex + Math.round(dy / rowStep);
        const current = order.value.indexOf(id);
        if (target !== current) {
            order.value.splice(target, 0, order.value.splice(current, 1)[0]!);
        }
        // Subtract the travel the reorder itself already absorbed, so the row stays under the finger.
        dragTranslate.value = dy - (target - dragStartIndex) * rowStep;
    }

    const startDrag = (id: string, e: PointerEvent) => {
        if (order.value.length <= 1 || e.button > 0) return;
        const handle = e.currentTarget as HTMLElement;
        const row = handle.closest("[data-lang-row]");
        const rows = (row?.parentElement?.children ?? []) as HTMLCollectionOf<HTMLElement>;
        rowStep =
            rows.length > 1
                ? rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().top
                : 0;
        dragStartY = e.clientY;
        dragStartIndex = order.value.indexOf(id);
        draggingId.value = id;
        dragTranslate.value = 0;
        handle.setPointerCapture?.(e.pointerId);
    };

    return { draggingId, dragTranslate, startDrag, onDragMove, endDrag };
}
