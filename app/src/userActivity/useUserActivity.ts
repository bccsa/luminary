import { ref, watch, type Ref } from "vue";
import type { UserActivityDoc, UserActivityType } from "./db";
import { getUserActivity, userActivityVersion } from "./store";

/**
 * The stored activity of one type, newest first. IndexedDB has no reactivity of its own, so
 * the list is re-read whenever an activity is written.
 */
export function useUserActivity(type: UserActivityType): Ref<UserActivityDoc[]> {
    const rows = ref<UserActivityDoc[]>([]);

    watch(
        userActivityVersion,
        async () => {
            rows.value = await getUserActivity(type);
        },
        { immediate: true },
    );

    return rows;
}
