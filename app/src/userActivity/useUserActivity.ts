import { ref, watch, type Ref } from "vue";
import type { UserActivityEntry, UserActivityType } from "luminary-shared";
import { getAllUserActivity, getUserActivity, userActivityVersion } from "./store";

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
