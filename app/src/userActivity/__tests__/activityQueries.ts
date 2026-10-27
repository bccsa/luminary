import { DocType, queryLocal, type UserActivityDto, type UserActivityType } from "luminary-shared";
import { userActivityId, type ActivityRef } from "../store";

/** Stored activity of one kind, newest first, tombstones excluded — read the way the app reads it. */
export async function getUserActivity(
    activity: UserActivityType,
    limit?: number,
): Promise<UserActivityDto[]> {
    return queryLocal<UserActivityDto>({
        selector: { type: DocType.UserActivity, activity, deleted: { $exists: false } },
        $sort: [{ updatedTimeUtc: "desc" }],
        ...(limit === undefined ? {} : { $limit: limit }),
    });
}

export async function hasUserActivity(ref: ActivityRef): Promise<boolean> {
    const rows = await queryLocal<UserActivityDto>({
        selector: {
            _id: { $in: [userActivityId(ref)] },
            type: DocType.UserActivity,
            deleted: { $exists: false },
        },
    });
    return rows.length > 0;
}
