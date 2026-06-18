import { computed, inject, ref, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useInfiniteScroll } from "@vueuse/core";
import { basePageScrollKey } from "@/keys/basePageScroll";

export type UseInfiniteScrollListOptions = {
    /** Rows revealed per scroll step (and the initial window). Default 20. */
    pageSize?: number;
    /** When any of these change, the visible window resets to one page. */
    resetWhen?: MaybeRefOrGetter<unknown>[];
    /** Distance (px) from the scroll bottom before loading more. Default 150. */
    distance?: number;
};

/**
 * Reveal a growing slice of an in-memory list as the user scrolls the
 * {@link BasePage} content area (`useInfiniteScroll` from `@vueuse/core`).
 */
export function useInfiniteScrollList<T>(
    source: Ref<readonly T[]>,
    options: UseInfiniteScrollListOptions = {},
) {
    const pageSize = options.pageSize ?? 20;
    const distance = options.distance ?? 150;

    const visibleCount = ref(pageSize);

    const reset = () => {
        visibleCount.value = pageSize;
    };

    if (options.resetWhen?.length) {
        watch(options.resetWhen, reset);
    }

    watch(
        () => source.value.length,
        (len, prev) => {
            if (len < (prev ?? 0)) reset();
        },
    );

    const visible = computed(() => source.value.slice(0, visibleCount.value));
    const hasMore = computed(() => visibleCount.value < source.value.length);

    const scrollEl = inject(basePageScrollKey, ref(null));

    useInfiniteScroll(
        () => scrollEl.value,
        () => {
            if (hasMore.value) visibleCount.value += pageSize;
        },
        { distance },
    );

    return { visible, hasMore, reset };
}
