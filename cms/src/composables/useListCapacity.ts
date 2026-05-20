import { nextTick, onUnmounted, ref, watch } from "vue";

/**
 * Measures how many list items fit in a list's parent container without
 * scrolling and keeps the value in sync via a ResizeObserver. Used to size
 * dashboard lists to the height available to them.
 *
 * Assign the returned `listEl` to the `<ul>`, slice the rendered items by
 * `capacity`, and call `update` (on `nextTick`) whenever the rendered items
 * change so the measured item height stays accurate.
 */
export function useListCapacity(defaultCapacity = 20) {
    const listEl = ref<HTMLElement | null>(null);
    const capacity = ref(defaultCapacity);

    let resizeObserver: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;

    function computeCapacity(): number {
        const ulEl = listEl.value;
        if (!ulEl) return defaultCapacity;
        const parent = ulEl.parentElement;
        if (!parent) return defaultCapacity;
        const firstItem = ulEl.querySelector("li") as HTMLElement | null;
        const itemHeight = firstItem?.offsetHeight ?? 32;
        if (itemHeight <= 0) return defaultCapacity;
        const style = getComputedStyle(parent);
        const paddingY =
            (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const available = parent.clientHeight - paddingY;
        return Math.max(1, Math.floor(available / itemHeight));
    }

    function update() {
        capacity.value = computeCapacity();
    }

    watch(listEl, (el) => {
        if (observed) {
            resizeObserver?.unobserve(observed);
            observed = null;
        }
        if (el?.parentElement) {
            if (!resizeObserver) resizeObserver = new ResizeObserver(update);
            resizeObserver.observe(el.parentElement);
            observed = el.parentElement;
        }
        nextTick(update);
    });

    onUnmounted(() => {
        resizeObserver?.disconnect();
        resizeObserver = null;
    });

    return { listEl, capacity, update };
}
