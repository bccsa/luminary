import "fake-indexeddb/auto";
import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from "vitest";
import { ref } from "vue";

vi.mock("../../fts/ftsIndexer", async (importOriginal) => {
    const orig = await importOriginal<typeof import("../../fts/ftsIndexer")>();
    return { ...orig, scheduleCorpusStatsRecompute: vi.fn() };
});

import { db, initDatabase } from "../../db/database";
import { resetRetentionBuffer } from "../../db/retention";
import { initConfig, config } from "../../config";
import { isConnected } from "../../socket/socketio";
import { syncList } from "../../api/sync/state";
import { HybridQuery, initHybridQuery } from "./HybridQuery";
import { structuralCacheKey, writeResponseCache } from "./responseCache";
import { DocType, type BaseDocumentDto, type ContentDto } from "../../types";

const CUTOFF = 1_000_000;
const PUBLISH = CUTOFF - 1000;

const article = (over: Partial<ContentDto> = {}): BaseDocumentDto =>
    ({
        _id: "article-1",
        type: DocType.Content,
        parentType: DocType.Post,
        language: "lang-en",
        parentId: "post-1",
        slug: "article-1",
        title: "The Article",
        text: "<p>The full article body</p>",
        publishDate: PUBLISH,
        memberOf: ["g1"],
        updatedTimeUtc: PUBLISH,
        ...over,
    }) as unknown as BaseDocumentDto;

// The doc as the SSR cache write leaves it: `text` omitted, every other field —
// crucially `_id` and `updatedTimeUtc` — byte-identical to the real doc.
function textStripped(): BaseDocumentDto {
    const d = { ...(article() as Record<string, unknown>) };
    delete d.text;
    return d as BaseDocumentDto;
}

describe("HybridQuery — a text-stripped cache seed must not shadow the full doc", () => {
    const instances: HybridQuery<ContentDto>[] = [];
    let post: ReturnType<typeof vi.fn>;

    const query = {
        selector: { type: DocType.Content },
        $limit: 1,
    };

    beforeAll(async () => {
        initConfig({
            cms: false,
            docsIndex: "[type+postType]",
            apiUrl: "http://localhost:12345",
            contentPublishDateCutoff: CUTOFF,
            appLanguageIdsAsRef: ref(["lang-en"]),
        });
        await initDatabase();
        syncList.value = [
            {
                chunkType: `${DocType.Content}:${DocType.Post}`,
                memberOf: ["g1"],
                blockStart: 1,
                blockEnd: 0,
            },
        ];
    });

    beforeEach(async () => {
        resetRetentionBuffer();
        await db.docs.clear();
        localStorage.clear();
        config.cms = false;
        config.contentPublishDateCutoff = CUTOFF;
        isConnected.value = true;
        post = vi.fn().mockResolvedValue({ docs: [] });
        initHybridQuery({ post } as any);
    });

    afterEach(() => {
        instances.splice(0).forEach((q) => q.dispose());
        resetRetentionBuffer();
        localStorage.clear();
    });

    it("replaces the stripped seed with the full-text doc once the local read lands", async () => {
        // Seed exactly what the prerender writes for this query.
        writeResponseCache(structuralCacheKey(query as any), {
            local: [textStripped() as any],
            remote: [],
        });
        // The live/persisted copy carries the full body.
        await db.docs.bulkPut([article()]);

        const q = new HybridQuery<ContentDto>(query as any, {
            cache: true,
            stripFields: [],
            persistOffline: true,
        });
        instances.push(q);

        // First paint is the seed — no body yet, by design.
        expect(q.output.value[0]?.text).toBeUndefined();

        // Once the real Dexie read lands, the rendered doc must carry `text`.
        await vi.waitFor(() => {
            expect(q.output.value[0]?.text).toBe("<p>The full article body</p>");
        });
    });
});
