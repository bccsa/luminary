import { BadRequestException } from "@nestjs/common";
import { LEGACY_USER_ACTIVITY_SOURCE, USER_ACTIVITY_SOURCE } from "../userData/activityIdentity";

/** Omission selects shared data; an unrecognized source must never fall back to it. */
export function resolveDataSource(
    value: unknown,
): typeof LEGACY_USER_ACTIVITY_SOURCE | typeof USER_ACTIVITY_SOURCE | undefined {
    if (value === undefined) return undefined;
    if (value === LEGACY_USER_ACTIVITY_SOURCE || value === USER_ACTIVITY_SOURCE) return value;
    throw new BadRequestException("Unknown dataSource");
}
