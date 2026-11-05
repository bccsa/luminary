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
    const rows = ref<UserActivityEntry[]>([]);

    watch(
        userActivityVersion,
        async () => {
            rows.value = type === "all" ? await getAllUserActivity() : await getUserActivity(type);
        },
        { immediate: true },
    );

    return rows;
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
