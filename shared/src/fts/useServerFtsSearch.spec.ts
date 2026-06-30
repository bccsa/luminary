import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, effectScope } from "vue";

vi.mock("../api/RestApi", () => ({
    getRest: vi.fn(),
}));
vi.mock("../socket/socketio", () => ({
    isConnected: ref(true),
    getSocket: () => ({
        on: vi.fn(),
        off: vi.fn(),
    }),
}));

import { useServerFtsSearch } from "./useServerFtsSearch";
import { getRest } from "../api/RestApi";
import { initConfig } from "../config";
import { DocType } from "../types";

const ftsMock = vi.fn();

/** Let the immediate debounced watch (setTimeout 0) and the awaited fts() settle. */
function settle(ms = 30) {
    return new Promise((r) => setTimeout(r, ms));
}

function apiDocs(prefix: string, n: number) {
    return Array.from({ length: n }, (_, i) => ({
        docId: `${prefix}${i}`,
        score: 0,
        wordMatchScore: 0,
        doc: { _id: `${prefix}${i}`, name: `${prefix}${i}` },
    }));
}

describe("useServerFtsSearch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getRest).mockReturnValue({ fts: ftsMock } as any);
        ftsMock.mockResolvedValue([]);
        initConfig({ cms: true, docsIndex: "", apiUrl: "http://x" } as any);
    });

    it("forwards strict params (types, matchAllWords, sort, groups, cms, limit, offset)", async () => {
        const scope = effectScope();
        const query = ref("garden");
        scope.run(() =>
            useServerFtsSearch(query, {
                docType: DocType.User,
                sort: () => ({ field: "name", direction: "asc" }),
                filters: () => ({ groups: ["g1"] }),
                pageSize: 25,
                debounceMs: 0,
            }),
        );
        await settle();
        expect(ftsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                queryString: "garden",
                types: [DocType.User],
                matchAllWords: true,
                sort: { field: "name", direction: "asc" },
                groups: ["g1"],
                cms: true,
                limit: 25,
                offset: 0,
            }),
        );
        scope.stop();
    });

    it("does not search for queries shorter than 3 chars", async () => {
        const scope = effectScope();
        const query = ref("ab");
        scope.run(() => useServerFtsSearch(query, { docType: DocType.User, debounceMs: 0 }));
        await settle();
        expect(ftsMock).not.toHaveBeenCalled();
        scope.stop();
    });

    it("exposes returned docs and sets hasMore on a full page", async () => {
        ftsMock.mockResolvedValue(apiDocs("u", 20));
        const scope = effectScope();
        let api!: ReturnType<typeof useServerFtsSearch>;
        const query = ref("garden");
        scope.run(() => {
            api = useServerFtsSearch(query, { docType: DocType.User, pageSize: 20, debounceMs: 0 });
        });
        await settle();
        expect(api.docs.value).toHaveLength(20);
        expect(api.docs.value[0]).toEqual({ _id: "u0", name: "u0" });
        expect(api.hasMore.value).toBe(true);
        scope.stop();
    });

    it("loadMore appends the next page at the running offset", async () => {
        ftsMock.mockResolvedValue(apiDocs("a", 20));
        const scope = effectScope();
        let api!: ReturnType<typeof useServerFtsSearch>;
        const query = ref("garden");
        scope.run(() => {
            api = useServerFtsSearch(query, {
                docType: DocType.Redirect,
                pageSize: 20,
                debounceMs: 0,
            });
        });
        await settle();

        ftsMock.mockClear();
        ftsMock.mockResolvedValue(apiDocs("b", 1)); // partial page
        await api.loadMore();
        await settle();

        expect(ftsMock).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
        expect(api.docs.value).toHaveLength(21);
        expect(api.hasMore.value).toBe(false);
        scope.stop();
    });

    it("yields an empty result set when the API response is undefined (offline)", async () => {
        ftsMock.mockResolvedValue(undefined);
        const scope = effectScope();
        let api!: ReturnType<typeof useServerFtsSearch>;
        const query = ref("garden");
        scope.run(() => {
            api = useServerFtsSearch(query, { docType: DocType.User, debounceMs: 0 });
        });
        await settle();
        expect(api.docs.value).toEqual([]);
        expect(api.hasMore.value).toBe(false);
        scope.stop();
    });

    it("re-searches when the sort changes", async () => {
        const scope = effectScope();
        const query = ref("garden");
        const sort = ref<{ field: string; direction: "asc" | "desc" } | undefined>({
            field: "name",
            direction: "asc",
        });
        scope.run(() => useServerFtsSearch(query, { docType: DocType.User, sort, debounceMs: 0 }));
        await settle();

        ftsMock.mockClear();
        sort.value = { field: "updatedTimeUtc", direction: "desc" };
        await settle();
        expect(ftsMock).toHaveBeenCalledWith(
            expect.objectContaining({ sort: { field: "updatedTimeUtc", direction: "desc" } }),
        );
        scope.stop();
    });

    it("refresh clears isStale and re-runs from offset 0", async () => {
        ftsMock.mockResolvedValue(apiDocs("u", 1));
        const scope = effectScope();
        let api!: ReturnType<typeof useServerFtsSearch>;
        const query = ref("garden");
        scope.run(() => {
            api = useServerFtsSearch(query, { docType: DocType.User, debounceMs: 0 });
        });
        await settle();
        api.markStale();
        expect(api.isStale.value).toBe(true);

        ftsMock.mockClear();
        await api.refresh();
        await settle();

        expect(api.isStale.value).toBe(false);
        expect(ftsMock).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
        scope.stop();
    });
});
