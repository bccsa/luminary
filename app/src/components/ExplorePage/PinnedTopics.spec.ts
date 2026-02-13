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
import PinnedTopics from "./PinnedTopics.vue";

vi.mock("vue-router");
vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

/**
 * Wraps the component in a Suspense boundary since PinnedTopics uses top-level await.
 */
function mountWithSuspense() {
    const SuspenseWrapper = defineComponent({
        components: { PinnedTopics },
        template: "<Suspense><PinnedTopics /></Suspense>",
    });
    return mount(SuspenseWrapper);
}

// --- Test data factories ---

function makePinnedCategory(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: "content-pinned-cat1",
        type: DocType.Content,
        parentId: "tag-pinned-cat1",
        parentType: DocType.Tag,
        parentTagType: TagType.Category,
        parentPinned: 1,
        updatedTimeUtc: 1704114000000,
        memberOf: [],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "pinned-cat1",
        title: "Pinned Category 1",
        summary: "A pinned category",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    } as ContentDto;
}

function makeTopicUnderCategory(
    categoryTagId: string,
    overrides: Partial<ContentDto> = {},
): ContentDto {
    return {
        _id: "content-topic-under-cat",
        type: DocType.Content,
        parentId: "tag-topic1",
        parentType: DocType.Tag,
        parentTagType: TagType.Topic,
        updatedTimeUtc: 1704114000000,
        memberOf: [],
        parentTags: [categoryTagId],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "topic-under-cat",
        title: "Topic Under Pinned Category",
        summary: "A topic",
        publishDate: Date.now() - 100_000,
        availableTranslations: ["lang-eng"],
        ...overrides,
    } as ContentDto;
}

describe("PinnedTopics", () => {
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

    it("renders topics grouped under a pinned category", async () => {
        const pinnedCat = makePinnedCategory();
        const topic = makeTopicUnderCategory("tag-pinned-cat1");

        await db.docs.bulkPut([pinnedCat, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category 1");
            expect(wrapper.text()).toContain("Topic Under Pinned Category");
        });
    });

    it("renders multiple pinned categories with their topics", async () => {
        const pinnedCat1 = makePinnedCategory();
        const pinnedCat2 = makePinnedCategory({
            _id: "content-pinned-cat2",
            parentId: "tag-pinned-cat2",
            slug: "pinned-cat2",
            title: "Pinned Category 2",
            summary: "Second pinned category",
        });
        const topic1 = makeTopicUnderCategory("tag-pinned-cat1", {
            _id: "content-topic1",
            title: "Topic in Category 1",
        });
        const topic2 = makeTopicUnderCategory("tag-pinned-cat2", {
            _id: "content-topic2",
            parentId: "tag-topic2",
            slug: "topic-in-cat2",
            title: "Topic in Category 2",
            parentTags: ["tag-pinned-cat2"],
        });

        await db.docs.bulkPut([pinnedCat1, pinnedCat2, topic1, topic2]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category 1");
            expect(wrapper.text()).toContain("Topic in Category 1");
            expect(wrapper.text()).toContain("Pinned Category 2");
            expect(wrapper.text()).toContain("Topic in Category 2");
        });
    });

    it("does not render unpinned categories", async () => {
        const unpinnedCat = makePinnedCategory({
            _id: "content-unpinned-cat",
            parentId: "tag-unpinned-cat",
            parentPinned: 0,
            title: "Unpinned Category",
        });
        const topic = makeTopicUnderCategory("tag-unpinned-cat", {
            title: "Topic Under Unpinned",
        });

        await db.docs.bulkPut([unpinnedCat, topic]);

        const wrapper = mountWithSuspense();

        // Give it a moment to settle, then verify nothing renders
        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Unpinned Category");
            expect(wrapper.text()).not.toContain("Topic Under Unpinned");
        });
    });

    it("does not render topics with a future publish date", async () => {
        const pinnedCat = makePinnedCategory();
        const futureTopic = makeTopicUnderCategory("tag-pinned-cat1", {
            _id: "content-future-topic",
            title: "Future Topic",
            publishDate: Date.now() + 1_000_000_000,
        });

        await db.docs.bulkPut([pinnedCat, futureTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Future Topic");
        });
    });

    it("does not render expired topics", async () => {
        const pinnedCat = makePinnedCategory();
        const expiredTopic = makeTopicUnderCategory("tag-pinned-cat1", {
            _id: "content-expired-topic",
            title: "Expired Topic",
            expiryDate: 1000, // far in the past
        });

        await db.docs.bulkPut([pinnedCat, expiredTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Expired Topic");
        });
    });

    it("does not render a category with a future publish date", async () => {
        const futureCategory = makePinnedCategory({
            _id: "content-future-cat",
            parentId: "tag-future-cat",
            title: "Future Category",
            publishDate: Date.now() + 1_000_000_000,
        });
        const topic = makeTopicUnderCategory("tag-future-cat", {
            _id: "content-topic-future-cat",
            title: "Topic Under Future Category",
        });

        await db.docs.bulkPut([futureCategory, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Future Category");
            expect(wrapper.text()).not.toContain("Topic Under Future Category");
        });
    });

    it("does not render topics that don't belong to any pinned category", async () => {
        const pinnedCat = makePinnedCategory();
        // A valid topic under the pinned category so it renders
        const validTopic = makeTopicUnderCategory("tag-pinned-cat1", {
            _id: "content-valid-topic",
            title: "Valid Topic",
        });
        // An orphan topic under a non-existent category
        const orphanTopic = makeTopicUnderCategory("tag-nonexistent-cat", {
            _id: "content-orphan-topic",
            title: "Orphan Topic",
            parentTags: ["tag-nonexistent-cat"],
        });

        await db.docs.bulkPut([pinnedCat, validTopic, orphanTopic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Pinned Category 1");
            expect(wrapper.text()).toContain("Valid Topic");
        });

        // Orphan topic is not under the pinned category so it shouldn't appear
        expect(wrapper.text()).not.toContain("Orphan Topic");
    });

    it("renders nothing when no pinned categories exist", async () => {
        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            const collections = wrapper.findAllComponents({ name: "HorizontalContentTileCollection" });
            expect(collections.length).toBe(0);
        });
    });

    it("renders category summary alongside title", async () => {
        const pinnedCat = makePinnedCategory({
            summary: "This is a category summary",
        });
        const topic = makeTopicUnderCategory("tag-pinned-cat1");

        await db.docs.bulkPut([pinnedCat, topic]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("This is a category summary");
        });
    });

    it("includes topics without parentTagType (defaults to topic)", async () => {
        const pinnedCat = makePinnedCategory();
        // Topic without parentTagType should still be included per the query:
        // { $or: [{ parentTagType: { $exists: false } }, { parentTagType: TagType.Topic }] }
        const topicNoTagType: ContentDto = {
            _id: "content-no-tagtype",
            type: DocType.Content,
            parentId: "tag-topic-no-type",
            parentType: DocType.Tag,
            updatedTimeUtc: 1704114000000,
            memberOf: [],
            parentTags: ["tag-pinned-cat1"],
            language: "lang-eng",
            status: PublishStatus.Published,
            slug: "topic-no-tagtype",
            title: "Topic Without TagType",
            publishDate: Date.now() - 100_000,
            availableTranslations: ["lang-eng"],
        } as ContentDto;

        await db.docs.bulkPut([pinnedCat, topicNoTagType]);

        const wrapper = mountWithSuspense();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Topic Without TagType");
        });
    });
});
