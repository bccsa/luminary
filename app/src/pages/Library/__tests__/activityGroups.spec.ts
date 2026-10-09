import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { activityGroupOf, groupByActivityDate } from "../activityGroups";

// A Thursday, so "earlier this week" has room above it and below yesterday.
const NOW = DateTime.fromISO("2026-03-12T14:30:00").toMillis();
const at = (iso: string) => DateTime.fromISO(iso).toMillis();

describe("activityGroupOf", () => {
    it("puts the same calendar day under today, whatever the hour", () => {
        expect(activityGroupOf(at("2026-03-12T00:00:00"), NOW)).toBe("today");
        expect(activityGroupOf(at("2026-03-12T23:59:59"), NOW)).toBe("today");
    });

    it("puts the day before under yesterday", () => {
        expect(activityGroupOf(at("2026-03-11T08:00:00"), NOW)).toBe("yesterday");
        expect(activityGroupOf(at("2026-03-11T00:00:00"), NOW)).toBe("yesterday");
    });

    it("counts no day twice: this week starts above yesterday", () => {
        // Monday of the same week.
        expect(activityGroupOf(at("2026-03-09T12:00:00"), NOW)).toBe("this_week");
        // Sunday before it, so the previous week.
        expect(activityGroupOf(at("2026-03-08T12:00:00"), NOW)).toBe("this_month");
    });

    it("separates the month, the year and what is older", () => {
        expect(activityGroupOf(at("2026-03-01T00:00:00"), NOW)).toBe("this_month");
        expect(activityGroupOf(at("2026-02-28T23:59:59"), NOW)).toBe("this_year");
        expect(activityGroupOf(at("2026-01-01T00:00:00"), NOW)).toBe("this_year");
        expect(activityGroupOf(at("2025-12-31T23:59:59"), NOW)).toBe("older");
        expect(activityGroupOf(at("2019-06-01T00:00:00"), NOW)).toBe("older");
    });

    it("leaves this week empty on a Monday rather than wrong", () => {
        const monday = at("2026-03-09T09:00:00");

        // Sunday is yesterday, and the Saturday before it belongs to the previous week.
        expect(activityGroupOf(at("2026-03-08T12:00:00"), monday)).toBe("yesterday");
        expect(activityGroupOf(at("2026-03-07T12:00:00"), monday)).toBe("this_month");
    });

    it("treats a timestamp ahead of the clock as today", () => {
        expect(activityGroupOf(at("2026-03-12T23:00:00"), at("2026-03-12T01:00:00"))).toBe("today");
    });
});

describe("groupByActivityDate", () => {
    const item = (iso: string) => ({ ts: at(iso) });

    it("splits a newest-first list into its headings, in order", () => {
        const sections = groupByActivityDate(
            [
                item("2026-03-12T10:00:00"),
                item("2026-03-12T09:00:00"),
                item("2026-03-11T10:00:00"),
                item("2026-03-09T10:00:00"),
                item("2024-01-01T10:00:00"),
            ],
            (i) => i.ts,
            NOW,
        );

        expect(sections.map((s) => s.group)).toEqual(["today", "yesterday", "this_week", "older"]);
        expect(sections[0].items).toHaveLength(2);
    });

    it("leaves out the headings nothing falls under", () => {
        const sections = groupByActivityDate([item("2024-01-01T10:00:00")], (i) => i.ts, NOW);

        expect(sections.map((s) => s.group)).toEqual(["older"]);
    });

    it("returns nothing for an empty list", () => {
        expect(groupByActivityDate([], (i: { ts: number }) => i.ts, NOW)).toEqual([]);
    });
});
