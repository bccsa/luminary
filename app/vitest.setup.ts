import "fake-indexeddb/auto";
import { RouterLinkStub, config } from "@vue/test-utils";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { initConfig, initDatabase } from "luminary-shared";
import { APP_DOCS_INDEX } from "./src/docsIndex";

// ============================================================================
// Indexing warning detection — fail tests that trigger missing index warnings
// ============================================================================

const INDEXING_WARNING_PATTERNS = [
    /\[mangoToDexie\].*Missing index/,
    /\[mangoToDexie\].*Falling back to full table scan/,
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

// Work around mangoToDexie bulkGet+residual path returning [] for complex selectors
// (e.g. _id $in + mangoIsPublished). Use full in-memory filter so all tests get correct results.
vi.mock("luminary-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("luminary-shared")>();
    const mangoToDexieMock = async <T>(
        table: { filter: (fn: (d: unknown) => boolean) => { toArray(): Promise<T[]> } },
        query: { selector: unknown; $sort?: Array<Record<string, "asc" | "desc">>; $limit?: number },
    ) => {
        const pred = actual.mangoCompile(query.selector as Parameters<typeof actual.mangoCompile>[0]);
        let result = await table.filter((doc: unknown) => pred(doc)).toArray();
        const sort = Array.isArray(query?.$sort) ? query.$sort[0] : undefined;
        if (sort) {
            const [field, dir] = Object.entries(sort)[0] ?? [];
            if (field != null) {
                const mult = dir === "desc" ? -1 : 1;
                result = [...result].sort((a, b) => {
                    const va = (a as Record<string, unknown>)[field] as number;
                    const vb = (b as Record<string, unknown>)[field] as number;
                    return mult * (va - vb);
                });
            }
        }
        const limit = typeof query?.$limit === "number" ? query.$limit : undefined;
        return (limit != null ? result.slice(0, limit) : result) as T[];
    };
    return new Proxy(actual, {
        get(target, prop) {
            if (prop === "mangoToDexie") return mangoToDexieMock;
            return Reflect.get(target, prop);
        },
    });
});

config.global.stubs["RouterLink"] = RouterLinkStub;

window.matchMedia = vi.fn().mockImplementation((query) => {
    return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    };
});

beforeAll(async () => {
    initConfig({
        cms: false,
        docsIndex: APP_DOCS_INDEX,
        apiUrl: "http://localhost:12345",
    });

    await initDatabase();
});
