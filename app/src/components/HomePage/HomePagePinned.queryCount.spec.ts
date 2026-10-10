import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockdata";
import {
    db,
    initConfig,
    initHybridQuery,
    isConnected,
    type ContentDto,
    DocType,
    TagType,
    PublishStatus,
} from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import { APP_DOCS_INDEX } from "@/docsIndex";
import HomePagePinned from "./HomePagePinned.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => mockLanguageDtoEng.translations[key] || key }),
}));

const CUTOFF = 1_700_000_000_000;
const CATEGORIES = 3;
const POSTS_PER_CATEGORY = 4;

/** Every `POST /query` the page issues, in order, so a test can count and inspect them. */
const posts: Array<Record<string, unknown>> = [];
/** Docs the categories supplement returns — the older tail a cold start discovers. */
let categoriesTail: unknown[] = [];

const isCategoriesQuery = (payload: Record<string, unknown>) =>
    JSON.stringify(payload.selector).includes('"parentPinned":1');

/** Round-trip latency to model, so a slow categories response lands AFTER the dependent
 * query has already fired its own burst — the ordering a real network produces. */
let latencyMs = 0;

const httpStub = {
    post: async (endpoint: string, payload: Record<string, unknown>) => {
        if (endpoint !== "query") return { docs: [] };
        posts.push(payload);
        const docs = isCategoriesQuery(payload) ? categoriesTail : [];
        if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
        return { docs };
    },
} as never;

function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { HomePagePinned },
        template: "<Suspense><HomePagePinned /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

function pinnedCategory(n: number): ContentDto {
    return {
        _id: `content-pinned-cat${n}`,
        type: DocType.Content,
        parentId: `tag-pinned-cat${n}`,
        parentType: DocType.Tag,
        parentTagType: TagType.Category,
        parentPinned: 1,
        updatedTimeUtc: CUTOFF + 1000,
        memberOf: [],
        parentTags: [],
        parentTaggedDocs: Array.from({ length: POSTS_PER_CATEGORY }, (_, i) => `post-c${n}-p${i}`),
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: `pinned-cat${n}`,
        title: `Pinned Category ${n}`,
        summary: "",
        publishDate: CUTOFF + 1000,
        availableTranslations: ["lang-eng"],
    } as ContentDto;
}

function child(cat: number, post: number): ContentDto {
    return {
        ...mockEnglishContentDto,
        _id: `content-c${cat}-p${post}-eng`,
        parentId: `post-c${cat}-p${post}`,
        parentTags: [`tag-pinned-cat${cat}`],
        parentTagType: TagType.Topic,
        title: `Child ${cat}-${post}`,
        publishDate: CUTOFF + 1000,
        availableTranslations: ["lang-eng"],
    };
}

// The pinned feed is a two-stage read: the categories query feeds the content query's
// `parentId $in`. The API supplement fans that out to one POST per parent, so each extra
// rebuild of the dependent query costs a whole burst of requests, not one.
describe("HomePagePinned — remote query count (#2032)", () => {
    beforeEach(async () => {
        posts.length = 0;
        categoriesTail = [];
        latencyMs = 0;
        await db.docs.clear();
        await db.localChanges.clear();

        // A cutoff is what makes HybridQuery decide an older-tail supplement at all;
        // without one it is local-only and the page issues no requests.
        initConfig({
            cms: false,
            docsIndex: APP_DOCS_INDEX,
            apiUrl: "http://localhost:12345",
            contentPublishDateCutoff: CUTOFF,
        });
        initHybridQuery(httpStub);
        // The supplement is parked on the reconnect watcher while offline, so the page
        // only issues requests when the client believes it is online.
        isConnected.value = true;

        await db.docs.bulkPut([mockLanguageDtoEng]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];
        setActivePinia(createTestingPinia());

        const docs: ContentDto[] = [];
        for (let c = 1; c <= CATEGORIES; c++) {
            docs.push(pinnedCategory(c));
            for (let p = 0; p < POSTS_PER_CATEGORY; p++) docs.push(child(c, p));
        }
        await db.docs.bulkPut(docs);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    /** The parentId each fan-out POST seeks; non-fan-out POSTs (the categories query) drop out. */
    const parentSeeks = () =>
        posts
            .map((q) => JSON.stringify(q.selector).match(/"parentId":"([^"]+)"/)?.[1])
            .filter((id): id is string => Boolean(id));

    it("seeks each parent exactly once when the categories query adds nothing", async () => {
        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child 1-0");
        });
        await new Promise((r) => setTimeout(r, 50));

        const seeks = parentSeeks();
        expect(seeks).toHaveLength(CATEGORIES * POSTS_PER_CATEGORY);
        expect(new Set(seeks).size).toBe(seeks.length);
        // The categories query itself is the only non-fan-out request.
        expect(posts).toHaveLength(seeks.length + 1);
    });

    it("seeks only the added parents when a slow categories supplement widens the set", async () => {
        // The categories supplement returns a fourth pinned category AFTER the dependent
        // query has already fanned out over the first three — the ordering a real network
        // produces, and what used to make the rebuild re-POST all twelve known parents.
        categoriesTail = [pinnedCategory(CATEGORIES + 1)];
        latencyMs = 30;

        const wrapper = mountWithSuspense();
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Child 1-0");
        });
        await waitForExpect(() => {
            expect(parentSeeks().length).toBe((CATEGORIES + 1) * POSTS_PER_CATEGORY);
        });
        // Give a re-fan a chance to show up before asserting it did not happen.
        await new Promise((r) => setTimeout(r, 200));

        const seeks = parentSeeks();
        expect(new Set(seeks).size).toBe(seeks.length);
        expect(seeks).toHaveLength((CATEGORIES + 1) * POSTS_PER_CATEGORY);
    });
});
