import {
    UserActivityType,
    userActivityDocumentId,
    type UserActivityDto,
    type UserActivityEntry,
} from "luminary-shared";

/** Convert a local history/UI row into the activity source's document shape. */
export function toUserActivityDocument(
    row: UserActivityEntry & { activityTimeUtc?: number },
): UserActivityDto {
    const range = row.payload?.range;
    const common = {
        _id: userActivityDocumentId({ ...row, range }),
        parentId: row.parentId,
        activityTimeUtc: row.activityTimeUtc ?? row.updatedTimeUtc,
        updatedTimeUtc: row.updatedTimeUtc,
        deleted: row.deleted,
    };
    if (row.type === UserActivityType.Highlighted) {
        if (!row.contentId || !range)
            throw new Error("A highlight requires its content and passage");
        return {
            ...common,
            type: UserActivityType.Highlighted,
            contentId: row.contentId,
            range: row.deleted ? { start: range.start, end: range.end } : { ...range },
        };
    }
    return {
        ...common,
        type:
            row.type === UserActivityType.Liked ? UserActivityType.Liked : UserActivityType.Viewed,
    };
}
