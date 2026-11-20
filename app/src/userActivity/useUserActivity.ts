import { ref, watch, type Ref } from "vue";
import type { UserActivityEntry, UserActivityType, Uuid } from "luminary-shared";
import {
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
export function useUserActivity(type: UserActivityType | "all"): Ref<UserActivityEntry[]> {
    return useUserActivityWithState(type).rows;
}

/**
 * Like {@link useUserActivity}, plus `loaded`: false until the first read returns, so a
 * page can tell "not read yet" from "nothing stored".
 */
export function useUserActivityWithState(type: UserActivityType | "all"): {
    rows: Ref<UserActivityEntry[]>;
    loaded: Ref<boolean>;
} {
    const rows = ref<UserActivityEntry[]>([]);
    const loaded = ref(false);

    watch(
        userActivityVersion,
        async () => {
            rows.value = type === "all" ? await getAllUserActivity() : await getUserActivity(type);
            loaded.value = true;
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
