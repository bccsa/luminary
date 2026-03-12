import { afterEach, beforeEach } from "vitest";

/**
 * Fail tests that trigger Dexie or mangoToDexie indexing warnings.
 *
 * These warnings indicate missing indexes that cause full table scans,
 * which is a performance bug. Any query exercised by tests should use
 * a properly indexed path.
 *
 * Tests that intentionally verify warning behavior should spy on
 * console.warn with mockImplementation — this suppresses the original
 * so the hook below never sees those calls.
 */

const INDEXING_WARNING_PATTERNS = [
    // mangoToDexie warnings
    /\[mangoToDexie\].*Missing index/,
    /\[mangoToDexie\].*Falling back to full table scan/,
    // Dexie built-in compound index warnings
    /Performance warning:.*No compound index found/i,
    /would benefit from a compound index/i,
    /SchemaError.*not indexed/i,
];

let interceptedWarnings: string[] = [];
const originalWarn = console.warn;

beforeEach(() => {
    interceptedWarnings = [];
    console.warn = (...args: unknown[]) => {
        const message = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
        if (INDEXING_WARNING_PATTERNS.some((p) => p.test(message))) {
            interceptedWarnings.push(message);
        }
        originalWarn.apply(console, args);
    };
});

afterEach(() => {
    console.warn = originalWarn;
    if (interceptedWarnings.length > 0) {
        const messages = interceptedWarnings.join("\n  ");
        throw new Error(
            `Indexing warning(s) detected — queries should use indexed fields:\n  ${messages}`,
        );
    }
});
