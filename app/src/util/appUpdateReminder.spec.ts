import { describe, expect, it } from "vitest";
import { isReminderDue, markReminderShown, reminderForVersion } from "./appUpdateReminder";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 1);

describe("appUpdateReminder", () => {
    it("starts tracking a version when it is first seen", () => {
        expect(reminderForVersion(null, "2.0.0", T0)).toEqual({
            version: "2.0.0",
            firstSeenAt: T0,
            shownCount: 0,
        });
    });

    it("keeps the progress of the same version", () => {
        const stored = {
            version: "2.0.0",
            firstSeenAt: T0,
            shownCount: 2,
            lastShownAt: T0 + DAY_MS,
        };

        expect(reminderForVersion(stored, "2.0.0", T0 + 5 * DAY_MS)).toBe(stored);
    });

    it("starts afresh for a different version", () => {
        const stored = { version: "2.0.0", firstSeenAt: T0, shownCount: 3, lastShownAt: T0 };

        expect(reminderForVersion(stored, "2.1.0", T0 + 20 * DAY_MS)).toEqual({
            version: "2.1.0",
            firstSeenAt: T0 + 20 * DAY_MS,
            shownCount: 0,
        });
    });

    it("waits three days after the update is first seen", () => {
        const reminder = reminderForVersion(null, "2.0.0", T0);

        expect(isReminderDue(reminder, T0 + 3 * DAY_MS - 1)).toBe(false);
        expect(isReminderDue(reminder, T0 + 3 * DAY_MS)).toBe(true);
    });

    it("reminds again three days, then seven days after the previous reminder", () => {
        let reminder = reminderForVersion(null, "2.0.0", T0);

        const first = T0 + 3 * DAY_MS;
        reminder = markReminderShown(reminder, first);
        expect(isReminderDue(reminder, first + 3 * DAY_MS - 1)).toBe(false);
        expect(isReminderDue(reminder, first + 3 * DAY_MS)).toBe(true);

        const second = first + 3 * DAY_MS;
        reminder = markReminderShown(reminder, second);
        expect(isReminderDue(reminder, second + 7 * DAY_MS - 1)).toBe(false);
        expect(isReminderDue(reminder, second + 7 * DAY_MS)).toBe(true);
    });

    it("stops after three reminders", () => {
        let reminder = reminderForVersion(null, "2.0.0", T0);
        reminder = markReminderShown(reminder, T0 + 3 * DAY_MS);
        reminder = markReminderShown(reminder, T0 + 6 * DAY_MS);
        reminder = markReminderShown(reminder, T0 + 13 * DAY_MS);

        expect(reminder.shownCount).toBe(3);
        expect(isReminderDue(reminder, T0 + 365 * DAY_MS)).toBe(false);
    });
});
