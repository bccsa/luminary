import "reflect-metadata";
import processContentDto from "./processContentDto";
import { ContentDto } from "../../dto/ContentDto";
import { DbService } from "../../db/db.service";
import { DocType, PublishStatus } from "../../enums";

jest.mock("../validateSlug", () => ({
    validateSlug: jest.fn(async (slug: string) => slug),
}));

describe("processContentDto — parent fields", () => {
    const parent = {
        _id: "post-1",
        type: DocType.Post,
        memberOf: ["group-public-content"],
        tags: [],
        imageBucketId: "image-bucket",
        media: { hlsUrl: "/collection/master.m3u8" },
        mediaBucketId: "media-bucket",
        postType: "blog",
    };

    function mockDb() {
        return {
            getDoc: jest.fn(async (id: string) => ({ docs: id === parent._id ? [parent] : [] })),
            getContentByParentId: jest.fn(async () => ({ docs: [] })),
            upsertDoc: jest.fn(),
            checkUniqueSlug: jest.fn(async () => true),
        } as unknown as DbService;
    }

    function content(): ContentDto {
        return {
            _id: "content-1",
            type: DocType.Content,
            parentId: parent._id,
            language: "lang-eng",
            status: PublishStatus.Draft,
            slug: "content-1",
            title: "Content 1",
        } as ContentDto;
    }

    it("stamps the parent's media bucket alongside its media", async () => {
        const doc = content();

        await processContentDto(doc, mockDb());

        expect(doc.parentMedia).toEqual(parent.media);
        expect(doc.parentMediaBucketId).toBe("media-bucket");
        expect(doc.parentImageBucketId).toBe("image-bucket");
    });

    it("overwrites a stale media bucket sent by the client", async () => {
        const doc = { ...content(), parentMediaBucketId: "stale-bucket" } as ContentDto;

        await processContentDto(doc, mockDb());

        expect(doc.parentMediaBucketId).toBe("media-bucket");
    });
});
