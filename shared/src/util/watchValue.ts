import { toRaw, watch, WatchOptions, WatchSource } from "vue";
import { cloneDeep, isEqual } from "lodash-es";

/**
 * A watcher that only triggers the callback when the actual value changes,
 * using deep structural comparison (lodash isEqual + toRaw) to ignore spurious
 * Vue reactive proxy updates where the underlying data is unchanged.
 * Useful for refs backed by external storage (e.g. useLocalStorage).
 */
export function watchValue<T>(
    source: WatchSource<T>,
    callback: (value: T, oldValue: T | undefined) => void,
    options?: WatchOptions,
): () => void {
    let lastValue: T | undefined;

    return watch(
        source,
        (newValue, oldValue) => {
            const raw = toRaw(newValue);
            if (!isEqual(raw, lastValue)) {
                lastValue = cloneDeep(raw);
                callback(newValue, oldValue);
            }
        },
        options,
    );
}
