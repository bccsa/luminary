import processPostTagDto from "./processPostTagDto";
import { processMedia } from "./processMediaDto";
import { migrateMediaCollection } from "./migrateMediaCollection";
import { deleteMediaCollection } from "./deleteMediaCollection";
import { processImage } from "./processImageDto";
import { DbService } from "../../db/db.service";
import { MediaDto } from "../../dto/MediaDto";
import { PostDto } from "../../dto/PostDto";
import { ContentDto } from "../../dto/ContentDto";

// processMedia is the code under test here, so it is left real.
jest.mock("./migrateMediaCollection", () => ({ migrateMediaCollection: jest.fn() }));
jest.mock("./deleteMediaCollection", () => ({ deleteMediaCollection: jest.fn() }));
jest.mock("./processImageDto", () => ({ processImage: jest.fn(), deleteImage: jest.fn() }));

const HLS = "https://cdn.elsewhere.example.com/abc/master.m3u8";

const child = () => ({ _id: "content-1", type: "content" }) as unknown as ContentDto;

const stubDb = (children: ContentDto[] = []) =>
    ({
        getDoc: jest.fn().mockResolvedValue({ docs: [] }),
        getDocsByType: jest.fn().mockResolvedValue({ docs: [] }),
        getContentByParentId: jest.fn().mockResolvedValue({ docs: children }),
        upsertDoc: jest.fn().mockResolvedValue({ id: "x" }),
    }) as unknown as DbService;

const post = (media: Partial<MediaDto>) =>
    ({
        _id: "post-1",
        type: "post",
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        media,
    }) as unknown as PostDto;

describe("the write-only deleteFiles flag", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (processImage as jest.Mock).mockResolvedValue({ warnings: [] });
        (deleteMediaCollection as jest.Mock).mockResolvedValue([]);
    });

    it("is dropped before the document is written", async () => {
        const media = { hlsUrl: HLS, deleteFiles: true } as MediaDto;

        await processMedia(media, post(media), stubDb());

        expect(media).not.toHaveProperty("deleteFiles");
    });

    it("is dropped even when it says no", async () => {
        const media = { hlsUrl: HLS, deleteFiles: false } as MediaDto;

        await processMedia(media, post(media), stubDb());

        expect(media).not.toHaveProperty("deleteFiles");
    });

    it("is not stamped onto the children an ordinary save updates", async () => {
        // parentMedia is copied from the parent, so a flag left there is read by a
        // later delete as an opt-in the editor never gave.
        const doc = post({ hlsUrl: HLS, deleteFiles: true });
        const contentDoc = child();

        await processPostTagDto(doc, undefined, stubDb([contentDoc]));

        expect(contentDoc.parentMedia).not.toHaveProperty("deleteFiles");
        expect(doc.media).not.toHaveProperty("deleteFiles");
    });
});
