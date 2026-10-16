import { describe, it, expect, vi } from "vitest";
import type { Event } from "@sentry/vue";

vi.mock("@/auth", () => ({ isAuthenticated: { value: false } }));
vi.mock("@/globalConfig", () => ({
    appLanguageAsRef: { value: undefined },
    isInstalledStandalone: () => false,
}));

import { classifyEvent } from "./initSentry";

const eventFor = (type: string, value: string): Event => ({
    exception: { values: [{ type, value }] },
});

describe("classifyEvent", () => {
    it.each([
        ["UnknownError", "Attempt to iterate a cursor that doesn't exist"],
        ["AbortError", "Transaction aborted"],
        [
            "UnknownError",
            "Connection to Indexed Database server lost. Refresh the page to try again",
        ],
        ["QuotaExceededError", "The quota has been exceeded."],
        ["DatabaseClosedError", "Database connection is closed"],
    ])("groups the browser storage failure %s: %s", (type, value) => {
        const event = classifyEvent(eventFor(type, value), {});

        expect(event.tags?.cause).toBe("browser-storage");
        expect(event.fingerprint).toEqual(["browser-storage", type]);
    });

    it("leaves application errors to Sentry's default grouping", () => {
        const event = classifyEvent(
            eventFor("TypeError", "Cannot read properties of undefined (reading 'title')"),
            {},
        );

        expect(event.tags?.cause).toBeUndefined();
        expect(event.fingerprint).toBeUndefined();
    });

    it("classifies from the original error when the event has no exception details", () => {
        const original = new Error(
            "Attempt to delete range from database without an in-progress transaction",
        );
        original.name = "BulkError";

        const event = classifyEvent({}, { originalException: original });

        expect(event.tags?.cause).toBe("browser-storage");
    });
});
