import processPostTagDto, { type AfterCommitTask } from "./processPostTagDto";
import processAuthProviderDto from "./processAuthProviderDto";
import { processImage } from "./processImageDto";
import { processMedia } from "./processMediaDto";
import { DbService } from "../../db/db.service";
import { PostDto } from "../../dto/PostDto";
import { AuthProviderDto } from "../../dto/AuthProviderDto";

jest.mock("./processImageDto", () => ({ processImage: jest.fn(), deleteImage: jest.fn() }));
jest.mock("./processMediaDto", () => ({ processMedia: jest.fn() }));
jest.mock("./migrateMediaCollection", () => ({ migrateMediaCollection: jest.fn() }));
jest.mock("./deleteMediaCollection", () => ({ deleteMediaCollection: jest.fn() }));

const stubDb = () =>
    ({
        getContentByParentId: jest.fn().mockResolvedValue({ docs: [] }),
        upsertDoc: jest.fn().mockResolvedValue({ id: "x" }),
        getDocs: jest.fn().mockResolvedValue({ docs: [] }),
        getDoc: jest.fn().mockResolvedValue({ docs: [] }),
        getDocsByType: jest.fn().mockResolvedValue({ docs: [] }),
    }) as unknown as DbService;

const post = (bucketId: string) =>
    ({
        _id: "post-1",
        type: "post",
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        imageBucketId: bucketId,
        imageData: { fileCollections: [{ aspectRatio: 1, imageFiles: [{ filename: "a.webp" }] }] },
    }) as unknown as PostDto;

const authProvider = (bucketId: string) =>
    ({
        _id: "auth-1",
        type: "authProvider",
        memberOf: ["group-public-users"],
        imageBucketId: bucketId,
        imageData: { fileCollections: [{ aspectRatio: 1, imageFiles: [{ filename: "a.webp" }] }] },
    }) as unknown as AuthProviderDto;

describe("image bucket migration cleanup is deferred to after the write", () => {
    let removeSource: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        removeSource = jest.fn().mockResolvedValue([]);
        (processImage as jest.Mock).mockResolvedValue({ warnings: [], removeSource });
        (processMedia as jest.Mock).mockResolvedValue([]);
    });

    it("hands a Post's source cleanup to the caller instead of running it", async () => {
        const afterCommit: AfterCommitTask[] = [];

        await processPostTagDto(post("bucket-new"), post("bucket-old"), stubDb(), afterCommit);

        expect(afterCommit).toEqual([removeSource]);
        expect(removeSource).not.toHaveBeenCalled();
    });

    it("hands an AuthProvider's source cleanup to the caller instead of running it", async () => {
        const afterCommit: AfterCommitTask[] = [];

        await processAuthProviderDto(
            authProvider("bucket-new"),
            authProvider("bucket-old"),
            stubDb(),
            afterCommit,
        );

        expect(afterCommit).toEqual([removeSource]);
        expect(removeSource).not.toHaveBeenCalled();
    });

    it("queues nothing when no migration happened", async () => {
        (processImage as jest.Mock).mockResolvedValue({ warnings: [] });
        const afterCommit: AfterCommitTask[] = [];

        await processPostTagDto(post("bucket-old"), post("bucket-old"), stubDb(), afterCommit);

        expect(afterCommit).toEqual([]);
    });

    it("keeps the document on the old bucket when the migration failed", async () => {
        (processImage as jest.Mock).mockResolvedValue({ warnings: [], migrationFailed: true });
        const incoming = post("bucket-new");
        const afterCommit: AfterCommitTask[] = [];

        await processPostTagDto(incoming, post("bucket-old"), stubDb(), afterCommit);

        expect(incoming.imageBucketId).toBe("bucket-old");
        expect(afterCommit).toEqual([]);
    });
});
