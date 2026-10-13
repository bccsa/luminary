// Temporary reproduction for #2155 — not to be committed.
import { v4 as uuidv4 } from "uuid";
import { createTestingModule } from "../../test/testingModule";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { storeCryptoData } from "../../util/encryption";
import { s3TestConfig, createTestCredentials } from "../../test/s3TestConfig";
import { DocType, StorageType, PostType } from "../../enums";
import processPostTagDto, { AfterCommitTask } from "./processPostTagDto";
import { PostDto } from "../../dto/PostDto";

async function makeBucket(db: DbService, label: string, rootPublicUrl = false) {
    const bucketName = `repro-${label}-${uuidv4().slice(0, 8)}`;
    const credId = await storeCryptoData(db, createTestCredentials(bucketName));
    const id = `storage-${label}-${uuidv4()}`;
    await db.upsertDoc({
        _id: id,
        type: DocType.Storage,
        name: `Bucket ${label}`,
        mimeTypes: ["video/*", "application/*"],
        publicUrl: rootPublicUrl ? s3TestConfig.publicUrl : `${s3TestConfig.publicUrl}/${bucketName}`,
        StorageType: StorageType.Media,
        credential_id: credId,
    });
    const s3 = await S3Service.create(id, db);
    await s3.makeBucket();
    return { id, bucketName, s3 };
}

describe("#2155 repro", () => {
    let db: DbService;

    beforeAll(async () => {
        db = (await createTestingModule("repro-2155")).dbService;
    });

    it("moves a standalone-encoder collection to another bucket", async () => {
        const a = await makeBucket(db, "a");
        const b = await makeBucket(db, "b");

        const prefix = `bccea-20260823/${uuidv4()}`;
        const keys = [`${prefix}/master.m3u8`, `${prefix}/stream_0/playlist.m3u8`, `${prefix}/stream_0/seg_0.ts`];
        for (const k of keys) await a.s3.uploadFile(k, Buffer.from("x"), "application/octet-stream");

        const post = {
            _id: `post-${uuidv4()}`,
            type: DocType.Post,
            postType: PostType.Blog,
            memberOf: ["group-public-content"],
            tags: [],
            mediaBucketId: a.id,
            media: { hlsUrl: `${s3TestConfig.publicUrl}/${a.bucketName}/${prefix}/master.m3u8` },
        } as unknown as PostDto;

        // First save, as when the URL is pasted in
        const w1 = await processPostTagDto(post, undefined, db);
        console.log("first save", post.media.hlsUrl, w1);
        await db.upsertDoc(post);

        // Move to bucket B
        const prev = JSON.parse(JSON.stringify(post));
        const moved = { ...JSON.parse(JSON.stringify(post)), mediaBucketId: b.id };
        const after: AfterCommitTask[] = [];
        const w2 = await processPostTagDto(moved, prev, db, after);
        console.log("move", moved.mediaBucketId, moved.media.hlsUrl, w2);

        expect(moved.mediaBucketId).toBe(b.id);
        expect(await b.s3.listObjectsUnder(`${prefix}/`)).toHaveLength(keys.length);
    });

    it("moves when the public URL is the server root and the bucket is in the path", async () => {
        const a = await makeBucket(db, "a", true);
        const b = await makeBucket(db, "b");

        const prefix = uuidv4();
        const keys = [`${prefix}/master.m3u8`, `${prefix}/stream_0/seg_0.ts`];
        for (const k of keys) await a.s3.uploadFile(k, Buffer.from("x"), "application/octet-stream");

        const post = {
            _id: `post-${uuidv4()}`,
            type: DocType.Post,
            postType: PostType.Blog,
            memberOf: ["group-public-content"],
            tags: [],
            mediaBucketId: a.id,
            media: { hlsUrl: `${s3TestConfig.publicUrl}/${a.bucketName}/${prefix}/master.m3u8` },
        } as unknown as PostDto;

        const w1 = await processPostTagDto(post, undefined, db);
        console.log("first save", post.media.hlsUrl, w1);
        await db.upsertDoc(post);

        const prev = JSON.parse(JSON.stringify(post));
        const moved = { ...JSON.parse(JSON.stringify(post)), mediaBucketId: b.id };
        const w2 = await processPostTagDto(moved, prev, db, []);
        console.log("move", moved.mediaBucketId === b.id ? "B" : "reverted", moved.media.hlsUrl, w2);

        expect(moved.mediaBucketId).toBe(b.id);
        expect(await b.s3.listObjectsUnder(`${prefix}/`)).toHaveLength(keys.length);
        expect(moved.media.hlsUrl).toBe(`/${prefix}/master.m3u8`);
    });
});
