import { liveQuery, type Subscription } from "dexie";
import {
    shallowRef,
    getCurrentScope,
    onScopeDispose,
    watch,
    type ShallowRef,
    type WatchOptions,
} from "vue";

export type Value<T, I> = I extends undefined ? T | undefined : T | I;

export type UseDexieLiveQueryOptions<
    I = undefined,
    Immediate extends Readonly<boolean> = true,
> = {
    onError?: (error: any) => void;
    initialValue?: I;
    /**
     * Reactive dependencies; when they change the query re-runs (forwarded to Vue `watch`).
     * Watch options (`immediate`, `deep`, `flush`, …) apply only when `deps` is provided.
     *
     * @deprecated For a reactive **hybrid** query (content / API-supplemented),
     * prefer auto-tracking: use `HybridQuery` / `useHybridQuery` with a
     * `() => MangoQuery` thunk that reads `ref.value` directly — its dependencies
     * are auto-tracked, so there is no `deps` array to keep in sync (a stale-query
     * footgun). For a **pure-local** Dexie read that doesn't need the hybrid
     * routing, `deps` is still supported (HybridQuery is not a like-for-like swap
     * there). Existing callers keep working.
     */
    deps?: any;
} & WatchOptions<Immediate>;

/**
 * @deprecated Use {@link UseDexieLiveQueryOptions}, which now supports `deps`.
 */
export type UseDexieLiveQueryWithDepsOptions<
    I = undefined,
    Immediate extends Readonly<boolean> = true,
> = UseDexieLiveQueryOptions<I, Immediate>;

function tryOnScopeDispose(fn: () => void) {
    if (getCurrentScope()) onScopeDispose(fn);
}

/**
 * Vue wrapper around Dexie's `liveQuery`. Subscribes to a Dexie query and exposes the
 * result as a `shallowRef`, re-subscribing on error (after 100ms) and unsubscribing on
 * scope dispose.
 *
 * Pass `options.deps` to re-run the query when reactive dependencies change — the querier
 * receives the watched value(s) as arguments. Without `deps` the query runs once.
 */
export function useDexieLiveQuery<
    T,
    I = undefined,
    Immediate extends Readonly<boolean> = true,
>(
    querier: (...data: any) => T | Promise<T>,
    options: UseDexieLiveQueryOptions<I, Immediate> = {},
): ShallowRef<Value<T, I>> {
    if (!getCurrentScope()) {
        console.warn(
            "[useDexieLiveQuery] called with no active Vue effect scope — the Dexie " +
                "subscription can never be cleaned up and will leak forever. Only call " +
                "useDexieLiveQuery from a component setup()/<script setup>, or another " +
                "composable/effectScope, so it can auto-dispose on scope teardown.",
        );
    }

    const { onError, initialValue, deps, ...rest } = options;

    const value = shallowRef<T | I | undefined>(initialValue);

    let subscription: Subscription | undefined = undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined = undefined;

    function start(...data: any) {
        // Cancel any pending retry and the previous subscription before (re)subscribing,
        // so a stale retry can't fire after a deps change or after cleanup.
        clearTimeout(retryTimer);
        retryTimer = undefined;
        subscription?.unsubscribe();

        const observable = liveQuery(() => querier(...data));

        subscription = observable.subscribe({
            next: (result) => {
                value.value = result;
            },
            error: (error) => {
                onError?.(error);

                retryTimer = setTimeout(() => {
                    start(...data);
                }, 100);
            },
        });
    }

    function cleanup() {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        subscription?.unsubscribe();

        // Set to undefined to avoid calling unsubscribe multiple times on a same subscription
        subscription = undefined;
    }

    if (deps) watch(deps, start, { immediate: true, ...rest });
    else start();

    tryOnScopeDispose(() => {
        cleanup();
    });

    return value as ShallowRef<Value<T, I>>;
}

/**
 * @deprecated Use `useDexieLiveQuery(querier, { deps, ...options })` instead.
 */
export function useDexieLiveQueryWithDeps<
    T,
    I = undefined,
    Immediate extends Readonly<boolean> = true,
>(
    deps: any,
    querier: (...data: any) => T | Promise<T>,
    options: UseDexieLiveQueryWithDepsOptions<I, Immediate> = {},
): ShallowRef<Value<T, I>> {
    return useDexieLiveQuery(querier, { ...options, deps });
}
