import { onMounted, onUnmounted, ref } from "vue";

/**
 * One-shot "has this element scrolled near the viewport" flag, via IntersectionObserver.
 * Stays true forever once triggered (never re-hides on scrolling back away) — this is for
 * deferring expensive work (DB queries, local FTS) on below-the-fold content until it's
 * actually about to be seen, not re-mounting it repeatedly.
 */
export function useLazyVisible(rootMargin = "300px") {
    const root = ref<HTMLElement | null>(null);
    const isVisible = ref(false);
    let observer: IntersectionObserver | undefined;

    onMounted(() => {
        if (!root.value) {
            // No element to observe — fail open rather than never rendering.
            isVisible.value = true;
            return;
        }
        observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    isVisible.value = true;
                    observer?.disconnect();
                }
            },
            { rootMargin },
        );
        observer.observe(root.value);
    });

    onUnmounted(() => observer?.disconnect());

    return { root, isVisible };
}
