import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { DocType, UserActivityType, type BaseDocumentDto } from "../../types";
import { mangoCompile } from "../../util/MangoQuery/mangoCompile";
import { syncBatch } from "./syncBatch";
import { syncList } from "./state";
import { setCancelSync } from "./sync";
import type { SyncListEntry, SyncSource } from "./types";

vi.mock("../../db/database", () => ({
    db: { bulkPut: vi.fn(), applySyncPage: vi.fn(), setSyncList: vi.fn(async () => {}) },
}));
import { db } from "../../db/database";

const cases = ["shared", "source"].flatMap((mode) =>
    [2, 100, 500].map((limit) => ({ mode, limit })),
);

async function pull(mode: string, limit: number, tied: boolean) {
    const type = mode === "source" ? UserActivityType.Viewed : DocType.Post;
    const documents: BaseDocumentDto[] = Array.from({ length: limit + 1 }, (_, i) => ({
        _id: limit === 2 ? ["tie-a", "tie-b", "tie-c"][i] : `tie-${String(i).padStart(4, "0")}`,
        type,
        updatedTimeUtc: tied ? 1000 : 1000 - i,
        memberOf: ["g1"],
    }));
    const stored = new Map<string, BaseDocumentDto>();
    const put = async (docs: BaseDocumentDto[]) => {
        for (const doc of docs) stored.set(doc._id, doc);
    };
    vi.mocked(db.bulkPut).mockImplementation(put);
    vi.mocked(db.applySyncPage).mockImplementation(put);
    const source: SyncSource | undefined =
        mode === "source"
            ? {
                  name: "user",
                  queryPath: "user/query",
                  syncList: ref<SyncListEntry[]>([]),
                  setSyncList: vi.fn(async () => {}),
                  put,
              }
            : undefined;
    const http = {
        post: vi.fn(async (_path: string, query: any) => {
            const after = query.syncPagination?.after;
            const selector = after
                ? {
                      ...query.selector,
                      $and: [
                          ...(query.selector.$and ?? []),
                          {
                              $or: [
                                  { updatedTimeUtc: { $lt: after.updatedTimeUtc } },
                                  { updatedTimeUtc: after.updatedTimeUtc, _id: { $lt: after.id } },
                              ],
                          },
                      ],
                  }
                : query.selector;
            const matches = mangoCompile(selector);
            return {
                docs: documents
                    .filter(matches)
                    .sort((a, b) => {
                        for (const sort of query.sort ?? []) {
                            const [field, direction] = Object.entries(sort)[0];
                            const left = (a as any)[field];
                            const right = (b as any)[field];
                            if (left === right) continue;
                            return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
                        }
                        return 0;
                    })
                    .slice(0, query.limit),
            };
        }),
    };
    const result = await syncBatch({
        type,
        memberOf: ["g1"],
        initialSync: true,
        pagination: "timestamp-id-v1",
        limit,
        source,
        httpService: http as any,
    });
    return {
        expected: documents.map((doc) => doc._id).sort(),
        actual: [...stored.keys()].sort(),
        result,
    };
}

describe("sync timestamp pagination", () => {
    beforeEach(() => {
        syncList.value = [];
        vi.clearAllMocks();
        setCancelSync(false);
    });
    afterEach(() => {
        syncList.value = [];
        setCancelSync(false);
    });

    it.each(cases)(
        "downloads across pages when timestamps differ ($mode, limit $limit)",
        async ({ mode, limit }) => {
            const { actual, expected, result } = await pull(mode, limit, false);
            expect(actual).toEqual(expected);
            expect(result?.eof).toBe(true);
        },
    );

    it.each(cases)(
        "downloads every tied document before EOF ($mode, limit $limit)",
        async ({ mode, limit }) => {
            const { actual, expected, result } = await pull(mode, limit, true);
            expect(result?.eof).toBe(true);
            expect(actual).toEqual(expected);
        },
    );
});
