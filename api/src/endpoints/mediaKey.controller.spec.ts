import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { MediaKeyController } from "./mediaKey.controller";
import { DbService } from "../db/db.service";
import { AuthGuard } from "../auth/auth.guard";
import * as permissionsService from "../permissions/permissions.service";
import * as encryption from "../util/encryption";
import { DocType } from "../enums";

const KEY = "0123456789abcdef0123456789abcdef";

describe("MediaKeyController", () => {
    let app: INestApplication;
    const mockGetDoc = jest.fn();
    const mockVerifyAccess = jest.fn();
    const mockRetrieveCryptoData = jest.fn();

    beforeAll(async () => {
        const testingModule: TestingModule = await Test.createTestingModule({
            controllers: [MediaKeyController],
            providers: [{ provide: DbService, useValue: { getDoc: mockGetDoc } }],
        })
            .overrideGuard(AuthGuard)
            .useValue({
                canActivate: (context: any) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { groups: ["group-public-users"], userId: "user-123" };
                    return true;
                },
            })
            .compile();

        app = testingModule.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    afterAll(async () => await app.close());

    beforeEach(() => {
        jest.resetAllMocks();
        jest.spyOn(permissionsService.PermissionSystem, "verifyAccess").mockImplementation(
            mockVerifyAccess,
        );
        jest.spyOn(encryption, "retrieveCryptoData").mockImplementation(mockRetrieveCryptoData);
        mockVerifyAccess.mockReturnValue(true);
        mockRetrieveCryptoData.mockResolvedValue(KEY);
    });

    const contentDoc = (overrides: Record<string, unknown> = {}) => ({
        _id: "content-1",
        type: DocType.Content,
        parentType: DocType.Post,
        memberOf: ["group-public-content"],
        parentMedia: { hlsUrl: "/media/abc/master.m3u8", hlsKey_id: "crypto-1" },
        ...overrides,
    });

    const get = (docId = "content-1") =>
        request(app.getHttpServer()).get("/media/key").query({ docId, apiVersion: "0.0.0" });

    it("hands the key to a viewer who may see the document", async () => {
        mockGetDoc.mockResolvedValue({ docs: [contentDoc()] });

        const res = await get();

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ keyHex: KEY });
        expect(mockRetrieveCryptoData).toHaveBeenCalledWith(expect.anything(), "crypto-1");
    });

    it("hands the key to an editor who may see the document in the CMS", async () => {
        // CmsView without View: an editor previewing media they are about to
        // publish. Denying it would mean the CMS could not play what it just
        // encoded.
        mockGetDoc.mockResolvedValue({ docs: [contentDoc()] });
        mockVerifyAccess.mockImplementation((_g, _t, permission) => permission === "cmsView");

        expect((await get()).status).toBe(200);
    });

    it("checks View on the parent type, not on the content document", async () => {
        // Content is not separately permissioned — that is why memberOf is copied
        // down onto it — so the permission that decides this is the parent's.
        mockGetDoc.mockResolvedValue({ docs: [contentDoc({ parentType: DocType.Tag })] });

        await get();

        expect(mockVerifyAccess).toHaveBeenCalledWith(
            ["group-public-content"],
            DocType.Tag,
            "view",
            ["group-public-users"],
        );
    });

    it("accepts the parent document too, where the media is not prefixed", async () => {
        mockGetDoc.mockResolvedValue({
            docs: [
                {
                    _id: "post-1",
                    type: DocType.Post,
                    memberOf: ["group-public-content"],
                    media: { hlsKey_id: "crypto-2" },
                },
            ],
        });

        const res = await get("post-1");

        expect(res.status).toBe(200);
        expect(mockRetrieveCryptoData).toHaveBeenCalledWith(expect.anything(), "crypto-2");
    });

    it("gives a viewer without access the same answer as a missing document", async () => {
        // Distinguishing them turns this into a probe for which documents exist,
        // and the caller has nothing useful to do with the difference.
        mockGetDoc.mockResolvedValue({ docs: [contentDoc()] });
        mockVerifyAccess.mockReturnValue(false);

        const denied = await get();

        mockGetDoc.mockResolvedValue({ docs: [] });
        const missing = await get("nope");

        expect(denied.status).toBe(404);
        expect(missing.status).toBe(404);
        expect(denied.body.message).toEqual(missing.body.message.replace("nope", "content-1"));
    });

    it("never reads the key for a viewer without access", async () => {
        mockGetDoc.mockResolvedValue({ docs: [contentDoc()] });
        mockVerifyAccess.mockReturnValue(false);

        await get();

        expect(mockRetrieveCryptoData).not.toHaveBeenCalled();
    });

    it("404s when the media carries no key", async () => {
        // Unencrypted media is normal, not an error the player should retry.
        mockGetDoc.mockResolvedValue({
            docs: [contentDoc({ parentMedia: { hlsUrl: "/media/abc/master.m3u8" } })],
        });

        expect((await get()).status).toBe(404);
    });

    it("distinguishes an unreadable key from an absent one", async () => {
        // A rotated ENCRYPTION_KEY or a vanished crypto document is not "no key
        // was ever set", and is not the caller's to fix.
        mockGetDoc.mockResolvedValue({ docs: [contentDoc()] });
        mockRetrieveCryptoData.mockRejectedValue(new Error("bad decrypt"));

        expect((await get()).status).toBe(409);
    });

    it("requires a docId", async () => {
        expect((await request(app.getHttpServer()).get("/media/key").query({ apiVersion: "0.0.0" })).status).toBe(400);
    });
});
