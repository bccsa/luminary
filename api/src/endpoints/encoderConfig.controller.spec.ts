import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { EncoderConfigController } from "./encoderConfig.controller";
import { DbService } from "../db/db.service";
import { AuthGuard } from "../auth/auth.guard";
import * as permissionsService from "../permissions/permissions.service";

jest.mock("../validation/apiVersion", () => ({
    validateApiVersion: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../util/encryption", () => ({
    retrieveCryptoData: jest.fn().mockResolvedValue({
        endpoint: "https://s3.example.com",
        accessKey: "key",
        secretKey: "secret",
        bucketName: "media",
    }),
}));

/**
 * The response is shaped as the encoder's session body, so the bucket's encode
 * settings must come out in the encoder's own field names — and their absence
 * must leave the encoder's defaults in charge rather than spelling them out.
 */
describe("EncoderConfigController", () => {
    let app: INestApplication;
    const mockGetDoc = jest.fn();

    const bucket = (mediaSettings?: object) => ({
        docs: [
            {
                _id: "bucket-1",
                name: "Media",
                memberOf: ["group-editors"],
                publicUrl: "https://cdn.example.com/media",
                credential_id: "cred-1",
                ...(mediaSettings !== undefined && { mediaSettings }),
            },
        ],
    });

    beforeAll(async () => {
        const testingModule: TestingModule = await Test.createTestingModule({
            controllers: [EncoderConfigController],
            providers: [{ provide: DbService, useValue: { getDoc: mockGetDoc } }],
        })
            .overrideGuard(AuthGuard)
            .useValue({
                canActivate: (context: any) => {
                    const req = context.switchToHttp().getRequest();
                    req.user = { groups: ["group-editors"], userId: "user-123" };
                    return true;
                },
            })
            .compile();

        app = testingModule.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        mockGetDoc.mockReset();
        jest.spyOn(permissionsService.PermissionSystem, "verifyAccess").mockReturnValue(true);
    });

    const get = () =>
        request(app.getHttpServer()).get(
            "/storage/encoderconfig?bucketId=bucket-1&apiVersion=0.0.0",
        );

    it("encrypts by default, which was the behaviour before it became a setting", async () => {
        mockGetDoc.mockResolvedValue(bucket());

        const res = await get().expect(200);

        expect(res.body.encryption).toEqual({ required: true });
    });

    it("passes an explicit opt-out of encryption through", async () => {
        mockGetDoc.mockResolvedValue(bucket({ encrypted: false }));

        const res = await get().expect(200);

        expect(res.body.encryption).toEqual({ required: false });
    });

    it("omits the byte-range fields when unset, leaving the encoder's defaults in charge", async () => {
        mockGetDoc.mockResolvedValue(bucket());

        const res = await get().expect(200);

        expect(res.body).not.toHaveProperty("byteRange");
        expect(res.body).not.toHaveProperty("byteRangeMaxFileSizeMB");
        expect(res.body).not.toHaveProperty("audioByteRangeMaxFileSizeMB");
    });

    it("sends one chunk size as both the video and the audio limit", async () => {
        mockGetDoc.mockResolvedValue(bucket({ byteRange: true, chunkSizeMB: 100 }));

        const res = await get().expect(200);

        expect(res.body.byteRange).toBe(true);
        expect(res.body.byteRangeMaxFileSizeMB).toBe(100);
        expect(res.body.audioByteRangeMaxFileSizeMB).toBe(100);
    });

    it("still hands out the credentials and public URL beside the settings", async () => {
        mockGetDoc.mockResolvedValue(bucket({ encrypted: false }));

        const res = await get().expect(200);

        expect(res.body.s3.bucket).toBe("media");
        expect(res.body.publicBaseUrl).toBe("https://cdn.example.com/media");
    });
});
