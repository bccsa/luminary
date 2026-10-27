import type { ShallowRef } from "vue";
import {
    DocType,
    useHybridQuery,
    type UserActivityDto,
    type UserActivityType,
} from "luminary-shared";

/** The stored activity, newest first and tombstones excluded — one kind, or `"all"` interleaved. */
export function useUserActivity(activity: UserActivityType | "all"): ShallowRef<UserActivityDto[]> {
    return useHybridQuery<UserActivityDto>(
        {
            selector: {
                type: DocType.UserActivity,
                deleted: { $exists: false },
                ...(activity === "all" ? {} : { activity }),
            },
            $sort: [{ updatedTimeUtc: "desc" }],
        },
        { live: true },
    );
}
