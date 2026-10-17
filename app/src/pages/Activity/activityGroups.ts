/**
 * The date headings the activity feed is split under. Activity is never dropped for being
 * old — only the `viewed` row cap bounds the table — so the last heading has to hold
 * entries of any age.
 */

import { DateTime } from "luxon";

export const ACTIVITY_GROUPS = [
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "this_year",
    "older",
] as const;

export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

/**
 * Which heading a timestamp belongs under. Each bound excludes the headings above it, so
 * "earlier this week" means before yesterday — a day is never counted twice. The week
 * starts on Monday, which leaves that heading empty on a Monday rather than wrong.
 */
export function activityGroupOf(timestamp: number, now: number = Date.now()): ActivityGroup {
    const at = DateTime.fromMillis(timestamp);
    const today = DateTime.fromMillis(now).startOf("day");

    if (at >= today) return "today";
    if (at >= today.minus({ days: 1 })) return "yesterday";
    if (at >= today.startOf("week")) return "this_week";
    if (at >= today.startOf("month")) return "this_month";
    if (at >= today.startOf("year")) return "this_year";
    return "older";
}

export type ActivitySection<T> = { group: ActivityGroup; items: T[] };

/**
 * Split a newest-first list into its headings, leaving out the ones nothing falls under.
 * Only the open section is appended to, which is what makes one pass enough — the input
 * comes off the `updatedTimeUtc` index, so it is already ordered.
 */
export function groupByActivityDate<T>(
    items: T[],
    timestampOf: (item: T) => number,
    now: number = Date.now(),
): ActivitySection<T>[] {
    const sections: ActivitySection<T>[] = [];

    for (const item of items) {
        const group = activityGroupOf(timestampOf(item), now);
        const open = sections[sections.length - 1];

        if (open?.group === group) open.items.push(item);
        else sections.push({ group, items: [item] });
    }

    return sections;
}
