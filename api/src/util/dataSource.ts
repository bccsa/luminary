import { BadRequestException } from "@nestjs/common";
import { USER_ACTIVITY_SOURCE } from "../userData/activityIdentity";

/** Omission selects shared data; an unrecognized source must never fall back to it. */
export function resolveDataSource(value: unknown): typeof USER_ACTIVITY_SOURCE | undefined {
    if (value === undefined) return undefined;
    if (value === USER_ACTIVITY_SOURCE) return value;
    throw new BadRequestException("Unknown dataSource");
}
