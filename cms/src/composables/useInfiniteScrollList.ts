import {
    computed,
    inject,
    ref,
    toValue,
    watch,
    type MaybeRefOrGetter,
    type Ref,
} from "vue";
import { useInfiniteScroll, useIntersectionObserver } from "@vueuse/core";
import { basePageScrollKey } from "@/keys/basePageScroll";

export type UseInfiniteScrollListOptions = {
    /** Rows revealed per scroll step (and the initial window). Default 20. */
    pageSize?: number;
    /** When any of these change, the visible window resets to one page. */
    resetWhen?: MaybeRefOrGetter<unknown>[];
    /** Distance (px) from the scroll bottom before loading more. Default 150. */
    distance?: number;
};

export type UseInfiniteScrollLoadMoreOptions = {
    hasMore: MaybeRefOrGetter<boolean>;
    isLoading?: MaybeRefOrGetter<boolean>;
    onLoadMore: () => void;
    /** IntersectionObserver rootMargin. Default "200px". */
    rootMargin?: string;
};

/**
 * Reveal a growing slice of an in-memory list as the user scrolls the
 * {@link BasePage} content area. Use when the full result set is already in a
 * ref (e.g. synced HybridQuery lists like Redirects).
 *
 * For query-level paging ({@link useHybridQuery} `$limit` growth, {@link useFtsSearch}
 * `loadMore`), use {@link useInfiniteScrollLoadMore} instead — the caller owns the window.
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

/**
 * Infinite scroll for externally paged lists: invokes `onLoadMore` when a sentinel
 * enters the viewport. Fits HybridQuery browse (`$limit` growth) and FTS search
 * (`loadMore`) where the data layer — not this composable — owns pagination.
 */
export function useInfiniteScrollLoadMore(options: UseInfiniteScrollLoadMoreOptions) {
    const sentinel = ref<HTMLElement | null>(null);

    useIntersectionObserver(
        sentinel,
        ([entry]) => {
            if (
                entry?.isIntersecting &&
                toValue(options.hasMore) &&
                !toValue(options.isLoading ?? false)
            ) {
                options.onLoadMore();
            }
        },
        { rootMargin: options.rootMargin ?? "200px" },
    );

    return { sentinel };
}
