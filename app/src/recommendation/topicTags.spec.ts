import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as shared from "luminary-shared";
import {
    db,
    DocType,
    PublishStatus,
    TagType,
    type ContentDto,
    type Uuid,
} from "luminary-shared";
import { filterTopicTagIds } from "./topicTags";

function makeTagContent(parentId: Uuid, parentTagType: TagType): ContentDto {
    return {
        _id: `content-${parentId}-lang-eng`,
        type: DocType.Content,
        parentType: DocType.Tag,
        parentId,
        parentTagType,
        updatedTimeUtc: 1,
        memberOf: ["group-public-content"],
        parentTags: [],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: parentId,
        title: parentId,
    };
}

describe("filterTopicTagIds", () => {
    beforeEach(async () => {
        await db.docs.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps a tag id whose synced content identifies it as a topic", async () => {
        await db.docs.bulkPut([makeTagContent("tag-topic", TagType.Topic)]);

        await expect(filterTopicTagIds(["tag-topic"])).resolves.toEqual(["tag-topic"]);
    });

    it("filters out a tag id whose synced content identifies it as a category", async () => {
        await db.docs.bulkPut([makeTagContent("tag-category", TagType.Category)]);

        await expect(filterTopicTagIds(["tag-category"])).resolves.toEqual([]);
    });

    it("filters out a tag id with no matching content in local storage", async () => {
        await expect(filterTopicTagIds(["tag-missing"])).resolves.toEqual([]);
    });

    it("returns immediately for an empty input without querying local storage", async () => {
        const queryLocal = vi.spyOn(shared, "queryLocal");

        await expect(filterTopicTagIds([])).resolves.toEqual([]);
        expect(queryLocal).not.toHaveBeenCalled();
    });

    it("keeps only topic ids from mixed topic, category, and missing inputs", async () => {
        await db.docs.bulkPut([
            makeTagContent("tag-topic-a", TagType.Topic),
            makeTagContent("tag-category", TagType.Category),
            makeTagContent("tag-topic-b", TagType.Topic),
        ]);

        const result = await filterTopicTagIds([
            "tag-topic-a",
            "tag-category",
            "tag-missing",
            "tag-topic-b",
        ]);

        expect(new Set(result)).toEqual(new Set(["tag-topic-a", "tag-topic-b"]));
    });

    it("fails open when the local query rejects", async () => {
        const tagIds = ["tag-topic", "tag-category"];
        vi.spyOn(shared, "queryLocal").mockRejectedValueOnce(new Error("IndexedDB unavailable"));

        await expect(filterTopicTagIds(tagIds)).resolves.toBe(tagIds);
    });
});
