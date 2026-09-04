import v21 from "./v21";
import { DocType } from "../../enums";

describe("v21 — legacy video field moved to media.hlsUrl", () => {
    function mockDb(
        version: number,
        docsByType: Record<string, any[]>,
        contentByParent: Record<string, any[]>,
    ) {
        const upserted: any[] = [];
        const db = {
            getSchemaVersion: jest.fn().mockResolvedValue(version),
            setSchemaVersion: jest.fn().mockResolvedValue(undefined),
            getDocsByType: jest.fn(async (docType: DocType) => ({
                docs: docsByType[docType] ?? [],
            })),
            getContentByParentId: jest.fn(async (parentId: string) => ({
                docs: contentByParent[parentId] ?? [],
            })),
            upsertDoc: jest.fn(async (doc: any) => {
                upserted.push(doc);
            }),
        } as any;
        return { db, upserted };
    }

    function post(id: string, media?: any): any {
        return { _id: id, type: DocType.Post, ...(media !== undefined ? { media } : {}) };
    }

    function content(id: string, parentId: string, video?: string): any {
        return { _id: id, type: DocType.Content, parentId, ...(video ? { video } : {}) };
    }

    it("copies the child's video onto the parent's media.hlsUrl and clears it from the child", async () => {
        const p = post("post-1");
        const c = content("content-1", "post-1", "https://example.com/master.m3u8");
        const { db, upserted } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(p.media).toEqual({ fileCollections: [], hlsUrl: "https://example.com/master.m3u8" });
        expect(c.video).toBeUndefined();
        expect(upserted).toContain(p);
        expect(upserted).toContain(c);
        expect(db.setSchemaVersion).toHaveBeenCalledWith(21);
    });

    it("leaves an existing parent hlsUrl untouched but still clears the child's video", async () => {
        const p = post("post-1", {
            fileCollections: [],
            hlsUrl: "https://example.com/existing.m3u8",
        });
        const c = content("content-1", "post-1", "https://example.com/stale.m3u8");
        const { db, upserted } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(p.media.hlsUrl).toBe("https://example.com/existing.m3u8");
        expect(c.video).toBeUndefined();
        expect(upserted).not.toContain(p);
        expect(upserted).toContain(c);
    });

    it("keeps the first distinct video value across languages and drops the rest", async () => {
        const p = post("post-1");
        const c1 = content("content-1", "post-1", "https://example.com/a.m3u8");
        const c2 = content("content-2", "post-1", "https://example.com/b.m3u8");
        const { db } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [] },
            {
                "post-1": [c1, c2],
            },
        );

        await v21(db);

        expect(p.media.hlsUrl).toBe("https://example.com/a.m3u8");
        expect(c1.video).toBeUndefined();
        expect(c2.video).toBeUndefined();
    });

    it("skips parents with no video anywhere among their content", async () => {
        const p = post("post-1");
        const c = content("content-1", "post-1");
        const { db, upserted } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(p.media).toBeUndefined();
        expect(upserted).toHaveLength(0);
    });

    it("names the bucket when the moved URL lives inside a configured one", async () => {
        // Without it the next ordinary save is refused ("Bucket is not specified"),
        // and the CMS hides the selector when a single bucket exists.
        const bucket = {
            _id: "storage-media",
            type: DocType.Storage,
            publicUrl: "https://cdn.example.com/media",
        };
        const p = post("post-1");
        const c = content("content-1", "post-1", "https://cdn.example.com/media/abc/master.m3u8");
        const { db } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [], [DocType.Storage]: [bucket] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(p.mediaBucketId).toBe("storage-media");
    });

    it("leaves the bucket unset for a URL hosted elsewhere", async () => {
        const bucket = {
            _id: "storage-media",
            type: DocType.Storage,
            publicUrl: "https://cdn.example.com/media",
        };
        const p = post("post-1");
        const c = content("content-1", "post-1", "https://www.youtube.com/watch?v=abc");
        const { db } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [], [DocType.Storage]: [bucket] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(p.mediaBucketId).toBeUndefined();
    });

    it("stamps the moved media onto every translation, not only the one that had the video", async () => {
        // The app plays from the child's parentMedia mirror; only a parent save
        // would otherwise refresh it, so without this the video vanishes post-upgrade.
        const bucket = {
            _id: "storage-media",
            type: DocType.Storage,
            publicUrl: "https://cdn.example.com/media",
        };
        const p = post("post-1");
        const en = content("content-en", "post-1", "https://cdn.example.com/media/abc/master.m3u8");
        const fr = content("content-fr", "post-1");
        const { db, upserted } = mockDb(
            20,
            { [DocType.Post]: [p], [DocType.Tag]: [], [DocType.Storage]: [bucket] },
            { "post-1": [en, fr] },
        );

        await v21(db);

        for (const child of [en, fr]) {
            expect(child.parentMedia).toEqual(p.media);
            expect(child.parentMediaBucketId).toBe("storage-media");
            expect(child.video).toBeUndefined();
            expect(upserted).toContain(child);
        }
    });

    it("is a no-op when the schema version is not 20", async () => {
        const p = post("post-1");
        const c = content("content-1", "post-1", "https://example.com/a.m3u8");
        const { db, upserted } = mockDb(
            18,
            { [DocType.Post]: [p], [DocType.Tag]: [] },
            { "post-1": [c] },
        );

        await v21(db);

        expect(db.getDocsByType).not.toHaveBeenCalled();
        expect(db.setSchemaVersion).not.toHaveBeenCalled();
        expect(upserted).toHaveLength(0);
    });
});
