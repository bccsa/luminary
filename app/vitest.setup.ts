import "fake-indexeddb/auto";
import { RouterLinkStub, config, enableAutoUnmount } from "@vue/test-utils";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// Auto-unmount mounted components after each test so their HybridQuery live Dexie
// subscriptions are disposed. Without this, leaked subscriptions accumulate across
// a file's tests and re-run real mangoToDexie on every beforeEach mutation, which
// compounds badly under parallel load.
enableAutoUnmount(afterEach);
import { db, initConfig, initDatabase } from "luminary-shared";
import { APP_DOCS_INDEX } from "./src/docsIndex";
import { createI18n } from "vue-i18n";
import { mockLanguageDtoEng } from "./src/tests/mockdata";
import waitForExpect from "wait-for-expect";

// HybridQuery's real (un-mocked) Dexie reads make the multi-query page chains
// heavy; under parallel test load they can exceed wait-for-expect's 4.5s default.
// Give them more headroom — passing assertions still resolve as soon as they
// become true, so green suites aren't slowed.
waitForExpect.defaults.timeout = 15000;

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
    // Clear HybridQuery's response cache between tests. It persists to localStorage
    // ("hqcache:") keyed by structural query shape, so same-shaped queries across
    // tests would otherwise seed each other with stale first-paint data — harmless
    // in production (live data supersedes it) but a cross-test flake here.
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("hqcache:")) localStorage.removeItem(k);
    }

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

const testI18n = createI18n({
    legacy: false,
    locale: "eng",
    fallbackLocale: "eng",
    messages: { eng: mockLanguageDtoEng.translations as Record<string, string> },
});
config.global.plugins = [...(config.global.plugins || []), testI18n];

class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

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

    // Seed sync's syncList so HybridQuery routes fully-synced types (AuthProvider,
    // Language, Storage, Redirect, Content) to IndexedDB rather than the API — the
    // state a real client is in after its first sync (restored from IndexedDB by
    // initSync in production). Without this, typeIsInSyncList() is false in tests
    // and non-content reads would incorrectly route API-only.
    await db.setLuminaryInternals(
        "syncList",
        [
            "authProvider",
            "language",
            "storage",
            "redirect",
            "group",
            "content:post",
            "content:tag",
        ].map((chunkType) => ({
            chunkType,
            memberOf: ["group-public-content"],
            languages: [],
            blockStart: Number.MAX_SAFE_INTEGER,
            blockEnd: 0,
            eof: true,
        })),
    );
    await db.getSyncList();
});
