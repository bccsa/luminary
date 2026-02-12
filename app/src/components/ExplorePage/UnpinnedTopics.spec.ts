import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import {
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
} from "@/tests/mockdata";
import { db, type ContentDto, DocType, TagType, PublishStatus } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { appLanguageIdsAsRef } from "@/globalConfig";
import UnpinnedTopics from "./UnpinnedTopics.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since UnpinnedTopics uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { UnpinnedTopics },
        template: "<Suspense><UnpinnedTopics /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

// --- Test data factories ---

function makeUnpinnedCategory(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: "content-unpinned-cat1",
        type: DocType.Content,
        parentId: "tag-unpinned-cat1",
        parentType: DocType.Tag,
        parentTagType: TagType.Category,
        parentPinned: 0,
        updatedTimeUtc: 1704114000000,
        memberOf: [],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "unpinned-cat1",
        title: "Unpinned Category 1",
        summary: "An unpinned category",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    } as ContentDto;
}

function makeTopic(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: "content-topic1",
        type: DocType.Content,
        parentId: "tag-topic1",
        parentType: DocType.Tag,
        parentTagType: TagType.Topic,
        updatedTimeUtc: 1704114000000,
        memberOf: [],
        parentTags: ["tag-unpinned-cat1"],
        parentTaggedDocs: ["post-post1"],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "topic1",
        title: "Topic 1",
        summary: "A topic",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    } as ContentDto;
}

describe("UnpinnedTopics", () => {
    beforeEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();

        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa]);
        appLanguageIdsAsRef.value = [mockLanguageDtoEng._id];

        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
    });

    it("renders topics grouped under an unpinned category", async () => {
        const category = makeUnpinnedCategory();
        const topic = makeTopic();

        await db.docs.bulkPut([category, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Unpinned Category 1");
            expect(wrapper.text()).toContain("Topic 1");
        });
    });

    it("renders multiple unpinned categories with their topics", async () => {
        const cat1 = makeUnpinnedCategory();
        const cat2 = makeUnpinnedCategory({
            _id: "content-unpinned-cat2",
            parentId: "tag-unpinned-cat2",
            slug: "unpinned-cat2",
            title: "Unpinned Category 2",
        });
        const topic1 = makeTopic({
            _id: "content-topic1",
            title: "Topic in Cat 1",
            parentTags: ["tag-unpinned-cat1"],
        });
        const topic2 = makeTopic({
            _id: "content-topic2",
            parentId: "tag-topic2",
            slug: "topic-in-cat2",
            title: "Topic in Cat 2",
            parentTags: ["tag-unpinned-cat2"],
        });

        await db.docs.bulkPut([cat1, cat2, topic1, topic2]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Unpinned Category 1");
            expect(wrapper.text()).toContain("Topic in Cat 1");
            expect(wrapper.text()).toContain("Unpinned Category 2");
            expect(wrapper.text()).toContain("Topic in Cat 2");
        });
    });

    it("does not render pinned categories", async () => {
        const pinnedCat = makeUnpinnedCategory({
            _id: "content-pinned-cat",
            parentId: "tag-pinned-cat",
            parentPinned: 1,
            title: "Pinned Category",
        });
        const topic = makeTopic({
            parentTags: ["tag-pinned-cat"],
            title: "Topic Under Pinned",
        });

        await db.docs.bulkPut([pinnedCat, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Pinned Category");
        });
    });

    it("renders the untagged section for topics not under any category", async () => {
        const category = makeUnpinnedCategory();
        // A topic that doesn't belong to any category (no matching parentTags)
        const untaggedTopic = makeTopic({
            _id: "content-untagged-topic",
            title: "Untagged Topic",
            parentTags: [],
        });

        await db.docs.bulkPut([category, untaggedTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Untagged Topic");
            // The untagged section uses the i18n key "explore.other"
            expect(wrapper.text()).toContain("explore.other");
        });
    });

    it("does not render topics with a future publish date", async () => {
        const category = makeUnpinnedCategory();
        const futureTopic = makeTopic({
            _id: "content-future-topic",
            title: "Future Topic",
            publishDate: Date.now() + 1_000_000_000,
        });

        await db.docs.bulkPut([category, futureTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Future Topic");
        });
    });

    it("does not render expired topics", async () => {
        const category = makeUnpinnedCategory();
        const expiredTopic = makeTopic({
            _id: "content-expired-topic",
            title: "Expired Topic",
            expiryDate: 1000, // far in the past
        });

        await db.docs.bulkPut([category, expiredTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Expired Topic");
        });
    });

    it("does not render topics with empty parentTaggedDocs", async () => {
        const category = makeUnpinnedCategory();
        const emptyTaggedDocsTopic = makeTopic({
            _id: "content-empty-tagged",
            title: "Empty TaggedDocs Topic",
            parentTaggedDocs: [],
        });

        await db.docs.bulkPut([category, emptyTaggedDocsTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Empty TaggedDocs Topic");
        });
    });

    it("does not render a category with a future publish date", async () => {
        const futureCategory = makeUnpinnedCategory({
            _id: "content-future-cat",
            parentId: "tag-future-cat",
            title: "Future Category",
            publishDate: Date.now() + 1_000_000_000,
        });
        const topic = makeTopic({
            parentTags: ["tag-future-cat"],
            title: "Topic Under Future Category",
        });

        await db.docs.bulkPut([futureCategory, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Future Category");
        });
    });

    it("renders nothing when no unpinned categories or topics exist", async () => {
        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            const collections = wrapper.findAllComponents({ name: "HorizontalContentTileCollection" });
            expect(collections.length).toBe(0);
        });
    });

    it("renders category summary alongside title", async () => {
        const category = makeUnpinnedCategory({
            summary: "Category summary text",
        });
        const topic = makeTopic();

        await db.docs.bulkPut([category, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Category summary text");
        });
    });
});
