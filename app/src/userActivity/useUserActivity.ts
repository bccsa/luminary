import { ref, watch, type Ref } from "vue";
import type { UserActivityKind, Uuid } from "luminary-shared";
import {
    type ActivityEntry,
    getAllUserActivity,
    getUserActivity,
    getViewedParentIds,
    userActivityVersion,
} from "./store";

/**
 * The stored activity, newest first — one type, or `"all"` for the three interleaved.
 * IndexedDB has no reactivity of its own, so the list is re-read whenever an activity
 * is written.
 */
export function useUserActivity(type: UserActivityKind | "all"): Ref<ActivityEntry[]> {
    return useUserActivityWithState(type).rows;
}

/**
 * Like {@link useUserActivity}, plus `loaded`: false until the first read returns, so a
 * page can tell "not read yet" from "nothing stored".
 */
export function useUserActivityWithState(type: UserActivityKind | "all"): {
    rows: Ref<ActivityEntry[]>;
    loaded: Ref<boolean>;
} {
    const rows = ref<ActivityEntry[]>([]);
    const loaded = ref(false);

    let generation = 0;
    watch(
        userActivityVersion,
        async () => {
            const current = ++generation;
            const result =
                type === "all" ? await getAllUserActivity() : await getUserActivity(type);
            if (current === generation) {
                rows.value = result;
                loaded.value = true;
            }
        },
        { immediate: true },
    );

    return { rows, loaded };
}

/** The posts the user has viewed, re-read whenever an activity is written. */
export function useViewedParentIds(): Ref<Set<Uuid>> {
    const ids = ref<Set<Uuid>>(new Set());

    watch(
        userActivityVersion,
        async () => {
            ids.value = await getViewedParentIds();
        },
        { immediate: true },
    );

    return ids;
}
