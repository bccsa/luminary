import { v5 as uuidv5 } from "uuid";
import { UserActivityType } from "../enums";
import type { LegacyUserActivityDto } from "../dto/LegacyUserActivityDto";
import type { UserActivityDto } from "../dto/UserActivityDto";

export const USER_ACTIVITY_SOURCE = "user-v2";
export const LEGACY_USER_ACTIVITY_SOURCE = "user";
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

type ActivityInput = {
    _id: string;
    _rev?: string;
    type: string;
    activityType?: string;
    parentId: string;
    contentId?: string;
    activityTimeUtc?: number;
    updatedTimeUtc?: number;
    deleted?: boolean;
    range?: Passage;
    payload?: { range: Passage };
};

/** Converts earlier source documents and local history rows to the current format. */
export function normalizeUserActivityDocument(input: ActivityInput): UserActivityDto {
    const type = input.type === "userActivity" ? input.activityType : input.type;
    if (!isUserActivityType(type)) throw new Error("Unknown activity type");
    let range = input.range ?? input.payload?.range;
    if (type === UserActivityType.Highlighted && !range && input.deleted) {
        const match = /^highlighted:(.+):(\d+)-(\d+)$/.exec(input._id);
        if (match && match[1] === input.contentId) {
            range = { start: Number(match[2]), end: Number(match[3]) };
        }
    }
    const id = userActivityDocumentId({
        type,
        parentId: input.parentId,
        contentId: input.contentId,
        range,
    });
    const common = {
        _id: id,
        _rev: input._id === id ? input._rev : undefined,
        type,
        parentId: input.parentId,
        activityTimeUtc: input.activityTimeUtc ?? input.updatedTimeUtc ?? 0,
        updatedTimeUtc: input.updatedTimeUtc ?? 0,
        deleted: input.deleted,
    };
    if (type !== UserActivityType.Highlighted) return common as UserActivityDto;
    if (!range) throw new Error("A highlight requires a passage");
    return {
        ...common,
        contentId: input.contentId,
        range: input.deleted ? { start: range.start, end: range.end } : { ...range },
    } as UserActivityDto;
}

/** Older clients retain their original ids and envelope while sharing the same stored records. */
export function toLegacyUserActivityDocument(doc: UserActivityDto): LegacyUserActivityDto {
    const highlighted = doc.type === UserActivityType.Highlighted;
    return {
        _id: highlighted
            ? `highlighted:${doc.contentId}:${doc.range.start}-${doc.range.end}`
            : `${doc.type}:${doc.parentId}`,
        _rev: doc._rev,
        type: "userActivity",
        activityType: doc.type,
        parentId: doc.parentId,
        contentId: highlighted ? doc.contentId : undefined,
        activityTimeUtc: doc.activityTimeUtc,
        updatedTimeUtc: doc.updatedTimeUtc ?? 0,
        deleted: doc.deleted,
        payload: highlighted && !doc.deleted ? { range: doc.range } : undefined,
    } as LegacyUserActivityDto;
}
