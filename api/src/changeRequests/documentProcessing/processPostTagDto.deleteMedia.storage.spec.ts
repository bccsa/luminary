import { v4 as UUID } from "uuid";
import { DbService } from "../../db/db.service";
import { ChangeReqDto } from "../../dto/ChangeReqDto";
import { DocType } from "../../enums";
import { S3Service } from "../../s3/s3.service";
import { changeRequest_post } from "../../test/changeRequestDocuments";
import { createTestCredentials, s3TestConfig } from "../../test/s3TestConfig";
import { createTestingModule } from "../../test/testingModule";
import { storeCryptoData } from "../../util/encryption";
import { processChangeRequest } from "../processChangeRequest";

/**
 * Taking a video off a post, against real storage: the CMS's Delete video saves the post
 * without `media`, and the collection's files must leave the bucket, or the editor be warned.
 */
describe("processPostTagDto — a removed video's files, in real storage", () => {
    let db: DbService;
    const bucketName = `media-delete-${UUID()}`;
    let bucketId: string;
    let storage: S3Service;

    /** What the encoder writes: a session-named folder with a playlist and its segments. */
    const encodeInto = async (session: string) => {
        const keys = [
            `${session}/master.m3u8`,
            `${session}/720p/index.m3u8`,
            `${session}/720p/seg0.ts`,
        ];
        for (const key of keys)
            await storage.uploadFile(
                key,
                Buffer.from("#EXTM3U\n"),
                "application/vnd.apple.mpegurl",
            );
        return keys;
    };

    const savePost = async (id: string, media: { hlsUrl: string } | undefined) => {
        const cr = changeRequest_post();
        cr.doc._id = id;
        (cr.doc as any).mediaBucketId = bucketId;
        if (media) (cr.doc as any).media = media;
        else delete (cr.doc as any).media;
        return processChangeRequest(
            "test-user",
            JSON.parse(JSON.stringify(cr)) as ChangeReqDto,
            ["group-super-admins"],
            db,
        );
    };

    beforeAll(async () => {
        db = (await createTestingModule("delete-media-storage")).dbService;

        const credentialId = await storeCryptoData(db, createTestCredentials(bucketName));
        bucketId = `bucket-${UUID()}`;
        await db.upsertDoc({
            _id: bucketId,
            type: DocType.Storage,
            memberOf: ["group-super-admins"],
            name: "Media test",
            storageType: "media",
            publicUrl: `${s3TestConfig.publicUrl}/${bucketName}`,
            credential_id: credentialId,
            updatedTimeUtc: Date.now(),
        } as any);

        storage = await S3Service.create(bucketId, db);
        if (!(await storage.bucketExists())) await storage.makeBucket();
    });

    it("deletes the collection's files once the post no longer has the video", async () => {
        const session = UUID();
        await encodeInto(session);
        await savePost("post-delete-media-ok", { hlsUrl: `/${session}/master.m3u8` });
        expect(await storage.listObjectsUnder(`${session}/`)).toHaveLength(3);

        const res = await savePost("post-delete-media-ok", undefined);

        expect(res.warnings ?? []).toEqual([]);
        expect(await storage.listObjectsUnder(`${session}/`)).toEqual([]);
    });

    it("keeps the files and warns the editor when storage refuses", async () => {
        const session = UUID();
        await encodeInto(session);
        await savePost("post-delete-media-refused", { hlsUrl: `/${session}/master.m3u8` });

        // Keys that storage turns down, as a bucket set up without delete rights would be.
        const refused = await storeCryptoData(db, {
            ...createTestCredentials(bucketName),
            secretKey: "wrong-secret",
        });
        const bucket = (await db.getDoc(bucketId)).docs[0];
        await db.upsertDoc({ ...bucket, credential_id: refused, updatedTimeUtc: Date.now() });
        S3Service.clearCache(bucketId);
        try {
            const res = await savePost("post-delete-media-refused", undefined);

            expect((res.warnings ?? []).join(" ")).toMatch(
                /could not be deleted|cleanup after saving failed/i,
            );
            expect(await storage.listObjectsUnder(`${session}/`)).toHaveLength(3);
        } finally {
            const current = (await db.getDoc(bucketId)).docs[0];
            await db.upsertDoc({
                ...current,
                credential_id: bucket.credential_id,
                updatedTimeUtc: Date.now(),
            });
            S3Service.clearCache(bucketId);
        }
    });
});
