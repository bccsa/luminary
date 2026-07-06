import "fake-indexeddb/auto";
import { RouterLinkStub, config, enableAutoUnmount } from "@vue/test-utils";
import { initDatabase, initConfig, db } from "luminary-shared";
import { syncList } from "../shared/src/api/sync/state";
import { CMS_DOCS_INDEX } from "./src/docsIndex";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// Every CMS doc type, tracked across all standard fixture groups. `deleteRevoked()` reconciles the
// runtime syncList against each test's accessMap (trimming a column to the groups that map actually
// grants — GitHub #160), exactly as it does in a live CMS where sync re-creates columns for the
// user's real CmsView groups. Seeding every standard group here means that reconciliation always
// leaves a surviving column for the types under test (instead of trimming a single fixed group to
// empty and flipping HybridQuery to API-only). Re-applied in `beforeEach` since reconciliation
// mutates the list per test.
const SEED_GROUPS = [
    "group-super-admins",
    "group-public-content",
    "group-private-content",
    "group-public-editors",
    "group-private-editors",
    "group-languages",
    "group-public-users",
    "group-private-users",
];
const seededSyncList = () =>
    [
        "authProvider",
        "language",
        "storage",
        "redirect",
        "group",
        "post",
        "tag",
        "content:post",
        "content:tag",
    ].map((chunkType) => ({
        chunkType,
        memberOf: [...SEED_GROUPS],
        languages: [],
        blockStart: Number.MAX_SAFE_INTEGER,
        blockEnd: 0,
        eof: true,
    }));

// Mounted components with live queries keep subscriptions until unmount; dispose
// them after each test so state does not leak across cases.
enableAutoUnmount(afterEach);

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
    // Response-cache keys are structural and persist in localStorage; clear them
    // so same-shaped queries in different tests do not seed each other.
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("hqcache:")) localStorage.removeItem(k);
    }

    // Re-seed the runtime syncList before each test (reconciliation mutates it per test — see above).
    syncList.value = seededSyncList();

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

config.global.stubs["RouterLink"] = RouterLinkStub;

// Mock URL.createObjectURL and revokeObjectURL for browser APIs in tests
global.URL.createObjectURL = () => {
    return `blob:mock-url-${Math.random().toString(36).substring(2, 9)}`;
};
global.URL.revokeObjectURL = () => {
    // No-op for tests
};

// jsdom does not implement Element.prototype.scrollIntoView; LDropdown calls it on open
// and the rejection surfaces as an unhandled error that fails the run.
Element.prototype.scrollIntoView = () => {};

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
        cms: true,
        docsIndex: CMS_DOCS_INDEX,
        apiUrl: "http://localhost:12345",
    });

    await initDatabase();

    // A running CMS client restores syncList from IndexedDB once sync has run.
    // Component tests mount views without that bootstrap, but HybridQuery (and
    // isSyncableDoc) consult syncList to decide how each doc type is served.
    // Seed the CMS sync columns here so queries over synced types (storage,
    // group, post, …) read the docs tests bulkPut into IndexedDB.
    await db.setLuminaryInternals("syncList", seededSyncList());
    await db.getSyncList();
});
