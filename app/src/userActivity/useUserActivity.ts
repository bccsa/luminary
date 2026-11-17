import { ref, watch, type Ref } from "vue";
import type { UserActivityType } from "luminary-shared";
import {
    type ActivityEntry,
    getAllUserActivity,
    getUserActivity,
    userActivityVersion,
} from "./store";

/**
 * The stored activity, newest first — one type, or `"all"` for the three interleaved.
 * IndexedDB has no reactivity of its own, so the list is re-read whenever an activity
 * is written.
 */
export function useUserActivity(type: UserActivityType | "all"): Ref<ActivityEntry[]> {
    const rows = ref<ActivityEntry[]>([]);

    let generation = 0;
    watch(
        userActivityVersion,
        async () => {
            const current = ++generation;
            const result =
                type === "all" ? await getAllUserActivity() : await getUserActivity(type);
            if (current === generation) rows.value = result;
        },
        { immediate: true },
    );

    return rows;
}
