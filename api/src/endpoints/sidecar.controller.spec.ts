import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { SidecarController } from "./sidecar.controller";
import { DbService } from "../db/db.service";
import { AuthGuard } from "../auth/auth.guard";
import { createTestingModule } from "../test/testingModule";
import { PermissionSystem } from "../permissions/permissions.service";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { DocType, PublishStatus, SidecarType } from "../enums";
import { PostDto } from "../dto/PostDto";
import { ContentDto } from "../dto/ContentDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { MediaDto } from "../dto/MediaDto";
import { SidecarDto } from "../dto/SidecarDto";
import { sidecarId } from "../sidecar/sidecar.service";
import { maskKeyHex } from "../util/maskKey";
import { SidecarRateLimiterService } from "../ratelimit/sidecarRateLimiter.service";

// CouchDB-backed: exercises real processChangeRequest writes and the real
// PermissionSystem (ADR 0018). User-run.

const HLS_URL = "https://cdn.example.com/media/master.m3u8";
const KEY = "0123456789abcdef0123456789abcdef";
const NOW = Date.now();
const PAST = NOW - 60_000;
const FUTURE = NOW + 60 * 60 * 1000;

function postCr(id: string, media?: MediaDto): ChangeReqDto {
    const doc: PostDto = {
        _id: id,
        type: DocType.Post,
        memberOf: ["group-public-content"],
        tags: [],
        publishDateVisible: true,
        postType: "blog",
        image: `img-${id}`,
    } as PostDto;
    if (media) {
        doc.media = media;
        doc.mediaBucketId = "media-bucket";
    }
    return { doc };
}

function contentCr(
    id: string,
    parentId: string,
    opts: {
        status?: PublishStatus;
        publishDate?: number;
        expiryDate?: number;
        language?: string;
    } = {},
): ChangeReqDto {
    return {
        doc: {
            _id: id,
            type: DocType.Content,
            memberOf: ["group-public-content"],
            parentId,
            language: opts.language ?? "lang-eng",
            status: opts.status ?? PublishStatus.Published,
            slug: id,
            title: id,
            publishDate: opts.status === PublishStatus.Draft ? undefined : (opts.publishDate ?? PAST),
            expiryDate: opts.expiryDate,
        } as ContentDto,
    };
}

describe("SidecarController", () => {
    let app: INestApplication;
    let dbService: DbService;
    let requestUser: { groups: string[]; userId?: string };
    let rateLimiter: {
        checkRead: jest.Mock;
        recordReadStrike: jest.Mock;
        checkProbe: jest.Mock;
        recordProbeStrike: jest.Mock;
    };

    beforeAll(async () => {
        const testingModule = await createTestingModule("sidecar-controller");
        dbService = testingModule.dbService;
        PermissionSystem.upsertGroups((await dbService.getGroups()).docs);

        rateLimiter = {
            checkRead: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
            recordReadStrike: jest.fn(),
            checkProbe: jest.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
            recordProbeStrike: jest.fn(),
        };

        const moduleRef: TestingModule = await Test.createTestingModule({
            controllers: [SidecarController],
            providers: [
                { provide: DbService, useValue: dbService },
                { provide: SidecarRateLimiterService, useValue: rateLimiter },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue({
                canActivate: (context: any) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = requestUser;
                    return true;
                },
            })
            .compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();

        const admin = ["group-super-admins"];

        await processChangeRequest(
            "test-user",
            postCr("post-sc-live", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-live", "post-sc-live"),
            admin,
            dbService,
        );

        await processChangeRequest("test-user", postCr("post-sc-no-sidecar"), admin, dbService);
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-no-sidecar", "post-sc-no-sidecar"),
            admin,
            dbService,
        );

        await processChangeRequest(
            "test-user",
            postCr("post-sc-draft", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-draft", "post-sc-draft", { status: PublishStatus.Draft }),
            admin,
            dbService,
        );

        await processChangeRequest(
            "test-user",
            postCr("post-sc-scheduled", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-scheduled", "post-sc-scheduled", { publishDate: FUTURE }),
            admin,
            dbService,
        );

        await processChangeRequest(
            "test-user",
            postCr("post-sc-expired", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-expired", "post-sc-expired", { expiryDate: PAST }),
            admin,
            dbService,
        );

        await processChangeRequest(
            "test-user",
            postCr("post-sc-mixed", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-mixed-draft", "post-sc-mixed", { status: PublishStatus.Draft }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-mixed-live", "post-sc-mixed"),
            admin,
            dbService,
        );

        await processChangeRequest(
            "test-user",
            postCr("post-sc-wrong-lang", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-wrong-lang", "post-sc-wrong-lang", { language: "lang-fra" }),
            admin,
            dbService,
        );

        await processChangeRequest("test-user", postCr("post-sc-no-content"), admin, dbService);

        await processChangeRequest(
            "test-user",
            postCr("post-sc-corrupt", { hlsUrl: HLS_URL, hlsKey: KEY }),
            admin,
            dbService,
        );
        await processChangeRequest(
            "test-user",
            contentCr("content-sc-corrupt", "post-sc-corrupt"),
            admin,
            dbService,
        );
        // Overwrite the sidecar written above with a payload that fails isHlsEncryptionKeyData.
        const corrupt = new SidecarDto();
        corrupt._id = sidecarId("post-sc-corrupt", SidecarType.HlsEncryptionKey);
        corrupt.type = DocType.Sidecar;
        corrupt.parentId = "post-sc-corrupt";
        corrupt.parentType = DocType.Post;
        corrupt.sidecarType = SidecarType.HlsEncryptionKey;
        corrupt.memberOf = ["group-public-content"];
        corrupt.data = { notAKey: true };
        await dbService.upsertDoc(corrupt);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        requestUser = { groups: ["group-public-users"], userId: "test-user" };
    });

    function get(query: Record<string, string>) {
        return request(app.getHttpServer())
            .get("/sidecar")
            .query({ apiVersion: "0.0.0", ...query })
            .set("Authorization", "Bearer fake-token");
    }

    it("returns the masked key for a permitted caller whose parent has live published content", async () => {
        const res = await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });

        expect(res.status).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(Object.keys(res.body).sort()).toEqual(
            ["data", "parentId", "sidecarId", "sidecarType"].sort(),
        );
        const expectedId = sidecarId("post-sc-live", SidecarType.HlsEncryptionKey);
        expect(res.body.sidecarId).toBe(expectedId);
        expect(res.body.parentId).toBe("post-sc-live");
        expect(res.body.sidecarType).toBe(SidecarType.HlsEncryptionKey);
        // Round-trip: unmasking with the returned sidecarId recovers the original key.
        expect(maskKeyHex(res.body.sidecarId, res.body.data.maskedKeyHex)).toBe(KEY);
    });

    it("returns 403 for a caller without View on the parent's groups", async () => {
        requestUser = { groups: [], userId: "test-user" };
        const res = await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });
        expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown parentId", async () => {
        const res = await get({
            parentId: "post-sc-does-not-exist",
            sidecarType: SidecarType.HlsEncryptionKey,
        });
        expect(res.status).toBe(404);
    });

    it("returns 404 for a parentId naming a Content document rather than a Post/Tag", async () => {
        const res = await get({
            parentId: "content-sc-live",
            sidecarType: SidecarType.HlsEncryptionKey,
        });
        expect(res.status).toBe(404);
    });

    it("returns 404 for a known, available parent with no sidecar of that type", async () => {
        const res = await get({
            parentId: "post-sc-no-sidecar",
            sidecarType: SidecarType.HlsEncryptionKey,
        });
        expect(res.status).toBe(404);
    });

    it("returns 400 when parentId is missing", async () => {
        const res = await get({ sidecarType: SidecarType.HlsEncryptionKey });
        expect(res.status).toBe(400);
    });

    it("returns 400 for an unknown sidecarType", async () => {
        const res = await get({ parentId: "post-sc-live", sidecarType: "nonsense" });
        expect(res.status).toBe(400);
    });

    it("returns 409 when the stored sidecar payload fails the type's guard", async () => {
        const res = await get({
            parentId: "post-sc-corrupt",
            sidecarType: SidecarType.HlsEncryptionKey,
        });
        expect(res.status).toBe(409);
    });

    describe("availability check", () => {
        it("refuses a parent whose only content is a draft", async () => {
            const res = await get({
                parentId: "post-sc-draft",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(404);
        });

        it("refuses a parent whose only content is scheduled (publishDate in the future)", async () => {
            const res = await get({
                parentId: "post-sc-scheduled",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(404);
        });

        it("refuses a parent whose only content has expired", async () => {
            const res = await get({
                parentId: "post-sc-expired",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(404);
        });

        it("admits a parent with one draft and one live child (any-child rule)", async () => {
            const res = await get({
                parentId: "post-sc-mixed",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(200);
        });

        it("admits a parent whose live child is in a language the caller didn't ask for", async () => {
            const res = await get({
                parentId: "post-sc-wrong-lang",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(200);
        });

        it("refuses a parent with no Content children at all", async () => {
            const res = await get({
                parentId: "post-sc-no-content",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(404);
        });
    });

    describe("cms mode", () => {
        it("admits a draft-only parent when the caller holds CmsView (bypasses the availability gate)", async () => {
            requestUser = { groups: ["group-super-admins"], userId: "test-user" };
            const res = await get({
                parentId: "post-sc-draft",
                sidecarType: SidecarType.HlsEncryptionKey,
                cms: "true",
            });
            expect(res.status).toBe(200);
        });

        it("still 403s a caller with neither View nor CmsView", async () => {
            requestUser = { groups: [], userId: "test-user" };
            const res = await get({
                parentId: "post-sc-draft",
                sidecarType: SidecarType.HlsEncryptionKey,
                cms: "true",
            });
            expect(res.status).toBe(403);
        });

        it("404s a caller holding only View (no CmsView) even for a live parent", async () => {
            requestUser = { groups: ["group-public-users"], userId: "test-user" };
            const res = await get({
                parentId: "post-sc-live",
                sidecarType: SidecarType.HlsEncryptionKey,
                cms: "true",
            });
            expect(res.status).toBe(403);
        });
    });

    describe("rate limiting", () => {
        afterEach(() => {
            rateLimiter.checkRead.mockReturnValue({ allowed: true, retryAfterMs: 0 });
            rateLimiter.checkProbe.mockReturnValue({ allowed: true, retryAfterMs: 0 });
        });

        it("returns 429 with Retry-After when the read limiter denies the request", async () => {
            rateLimiter.checkRead.mockReturnValueOnce({ allowed: false, retryAfterMs: 4200 });
            const res = await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });
            expect(res.status).toBe(429);
            expect(res.headers["retry-after"]).toBe("5"); // ceil(4200/1000)
        });

        it("returns 429 when the probe limiter denies, even for a request that would otherwise succeed", async () => {
            rateLimiter.checkProbe.mockReturnValueOnce({ allowed: false, retryAfterMs: 1000 });
            const res = await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });
            expect(res.status).toBe(429);
            expect(res.headers["retry-after"]).toBe("1");
        });

        it("records a read strike on a successful fetch, keyed by the caller's identity", async () => {
            rateLimiter.recordReadStrike.mockClear();
            await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });
            expect(rateLimiter.recordReadStrike).toHaveBeenCalledWith("test-user");
            expect(rateLimiter.recordProbeStrike).not.toHaveBeenCalledWith("test-user");
        });

        it("records a probe strike, not a read strike, for a 403", async () => {
            requestUser = { groups: [], userId: "test-user" };
            rateLimiter.recordReadStrike.mockClear();
            rateLimiter.recordProbeStrike.mockClear();
            const res = await get({ parentId: "post-sc-live", sidecarType: SidecarType.HlsEncryptionKey });
            expect(res.status).toBe(403);
            expect(rateLimiter.recordProbeStrike).toHaveBeenCalledWith("test-user");
            expect(rateLimiter.recordReadStrike).not.toHaveBeenCalled();
        });

        it("records a probe strike, not a read strike, for a 404", async () => {
            rateLimiter.recordReadStrike.mockClear();
            rateLimiter.recordProbeStrike.mockClear();
            const res = await get({
                parentId: "post-sc-does-not-exist",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(404);
            expect(rateLimiter.recordProbeStrike).toHaveBeenCalledWith("test-user");
            expect(rateLimiter.recordReadStrike).not.toHaveBeenCalled();
        });

        it("does not record a probe strike for a 400 (missing parentId)", async () => {
            rateLimiter.recordProbeStrike.mockClear();
            const res = await get({ sidecarType: SidecarType.HlsEncryptionKey });
            expect(res.status).toBe(400);
            expect(rateLimiter.recordProbeStrike).not.toHaveBeenCalled();
        });

        it("does not record a probe strike for a 409 (corrupt payload)", async () => {
            rateLimiter.recordProbeStrike.mockClear();
            const res = await get({
                parentId: "post-sc-corrupt",
                sidecarType: SidecarType.HlsEncryptionKey,
            });
            expect(res.status).toBe(409);
            expect(rateLimiter.recordProbeStrike).not.toHaveBeenCalled();
        });
    });
});
