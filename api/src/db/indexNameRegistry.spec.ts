import * as path from "path";
import {
    loadIndexNames,
    getIndexNameRegistry,
    warmIndexNameRegistry,
    _resetIndexNameRegistryForTests,
} from "./indexNameRegistry";

const DESIGN_DOCS_DIR = path.join(__dirname, "designDocs");

describe("indexNameRegistry", () => {
    afterEach(() => {
        _resetIndexNameRegistryForTests();
    });

    describe("loadIndexNames", () => {
        it("includes Mango index (view) names that exist as design docs", () => {
            const names = loadIndexNames(DESIGN_DOCS_DIR);
            // Names sent by deployed clients today — must all be present so the wire
            // contract keeps validating.
            expect(names.has("sync-content-index")).toBe(true);
            expect(names.has("sync-post-index")).toBe(true);
            expect(names.has("content-publishDate-index")).toBe(true);
            expect(names.has("content-parentId-publishDate-index")).toBe(true);
            expect(names.has("content-slug-publishDate-index")).toBe(true);
            expect(names.has("content-parentPinned-publishDate-index")).toBe(true);
            expect(names.has("content-parentTagType-publishDate-index")).toBe(true);
        });

        it("excludes non-Mango JavaScript map/reduce views", () => {
            const names = loadIndexNames(DESIGN_DOCS_DIR);
            expect(names.has("parentId")).toBe(false);
            expect(names.has("slug")).toBe(false);
            // sync_deprecated's views (updatedTimeUtc, …) are JS views, not Mango.
            expect(names.has("updatedTimeUtc")).toBe(false);
            expect(names.has("view-user-email-userId")).toBe(false);
        });

        it("returns an empty set (no throw) for a missing directory", () => {
            const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
            const names = loadIndexNames(path.join(__dirname, "does-not-exist"));
            expect(names.size).toBe(0);
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe("getIndexNameRegistry", () => {
        it("memoizes — returns the same instance across calls", () => {
            const a = getIndexNameRegistry();
            const b = getIndexNameRegistry();
            expect(a).toBe(b);
        });

        it("loads the real design-doc index names", () => {
            expect(getIndexNameRegistry().has("sync-content-index")).toBe(true);
        });
    });

    describe("warmIndexNameRegistry", () => {
        it("(re)loads and returns the registry", () => {
            const warmed = warmIndexNameRegistry();
            expect(warmed.has("sync-content-index")).toBe(true);
            // Subsequent get returns the warmed instance.
            expect(getIndexNameRegistry()).toBe(warmed);
        });
    });
});
