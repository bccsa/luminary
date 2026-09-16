const DAY_MS = 24 * 60 * 60 * 1000;

// Test builds shorten the schedule by counting in something smaller than a day, so a
// reminder can be seen in a session instead of over a week.
const REMINDER_UNIT_MS = Number(import.meta.env.VITE_APP_UPDATE_REMINDER_UNIT_MS) || DAY_MS;

/**
 * Wait before each reminder about one store version: the first counts from when the
 * update was first seen, the next ones from the previous reminder. After the last
 * one, the update is only offered where the user looks for it.
 */
export const REMINDER_WAITS_MS: readonly number[] = [
    3 * REMINDER_UNIT_MS,
    3 * REMINDER_UNIT_MS,
    7 * REMINDER_UNIT_MS,
];

/** Reminder progress for one store version, kept across app launches. */
export type AppUpdateReminder = {
    version: string;
    firstSeenAt: number;
    shownCount: number;
    lastShownAt?: number;
};

/** Progress for `version`, starting afresh when a different version is in the store. */
export function reminderForVersion(
    stored: AppUpdateReminder | null | undefined,
    version: string,
    now: number,
): AppUpdateReminder {
    return stored?.version === version ? stored : { version, firstSeenAt: now, shownCount: 0 };
}

export function isReminderDue(reminder: AppUpdateReminder, now: number): boolean {
    if (reminder.shownCount >= REMINDER_WAITS_MS.length) return false;
    const since = reminder.lastShownAt ?? reminder.firstSeenAt;
    return now - since >= REMINDER_WAITS_MS[reminder.shownCount];
}

export function markReminderShown(reminder: AppUpdateReminder, now: number): AppUpdateReminder {
    return { ...reminder, shownCount: reminder.shownCount + 1, lastShownAt: now };
}
