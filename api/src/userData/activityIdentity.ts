import { v5 as uuidv5 } from "uuid";
import { UserActivityType } from "../enums";

export const USER_ACTIVITY_SOURCE = "user";
export const USER_ACTIVITY_TYPES = Object.values(UserActivityType);
// Persisted identity contract: keep the namespace and tuple encoding stable.
const ACTIVITY_NAMESPACE = "94bcbde6-4392-5f66-8900-7d7aabc6a7a9";

type Passage = { start: number; end: number; color?: string; text?: string };
export type ActivityIdentity = {
    type: `${UserActivityType}`;
    parentId: string;
    contentId?: string;
    range?: Passage;
};

export function isUserActivityType(value: unknown): value is UserActivityType {
    return USER_ACTIVITY_TYPES.includes(value as UserActivityType);
}

export function userActivityDocumentId(activity: ActivityIdentity): string {
    if (!isUserActivityType(activity.type)) throw new Error("Unknown activity type");
    const tuple =
        activity.type === UserActivityType.Highlighted
            ? [activity.type, activity.contentId, activity.range?.start, activity.range?.end]
            : [activity.type, activity.parentId];
    if (
        activity.type === UserActivityType.Highlighted &&
        (!activity.contentId || !activity.range)
    ) {
        throw new Error("A highlight identity requires its content id and passage offsets");
    }
    if (
        activity.range &&
        (!Number.isSafeInteger(activity.range.start) ||
            !Number.isSafeInteger(activity.range.end) ||
            activity.range.start < 0 ||
            activity.range.end <= activity.range.start)
    ) {
        throw new Error("Invalid highlight passage offsets");
    }
    return uuidv5(JSON.stringify(tuple), ACTIVITY_NAMESPACE);
}
