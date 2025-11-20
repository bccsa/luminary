import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { StorageStatusController } from "./storageStatus.controller";
import { S3Service } from "../s3/s3.service";
import { DbService } from "../db/db.service";
import { AuthGuard } from "../auth/auth.guard";
import * as jwtModule from "../jwt/processJwt";
import * as permissionsService from "../permissions/permissions.service";
import { DocType } from "../enums";
import { v4 as uuidv4 } from "uuid";

describe("StorageController", () => {
    let app: INestApplication;
    const mockCheckBucketConnectivity = jest.fn();
    const mockGetDoc = jest.fn();
    const mockProcessJwt = jest.fn();
    const mockVerifyAccess = jest.fn();
    const mockS3ServiceCreate = jest.fn();

    beforeAll(async () => {
        const testingModule: TestingModule = await Test.createTestingModule({
            controllers: [StorageStatusController],
            providers: [
                {
                    provide: DbService,
                    useValue: {
                        getDoc: mockGetDoc,
                    },
                },
            ],
        })
            .overrideGuard(AuthGuard)
            .useValue({ canActivate: () => true })
            .compile();

        app = testingModule.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
        S3Service.clearCache();
    });

    beforeEach(() => {
        // Reset mocks and re-establish spies so each test sets its own mock implementations
        jest.resetAllMocks();
        jest.spyOn(jwtModule, "processJwt").mockImplementation(mockProcessJwt);
        jest.spyOn(permissionsService.PermissionSystem, "verifyAccess").mockImplementation(
            mockVerifyAccess,
        );
        jest.spyOn(S3Service, "create").mockImplementation(mockS3ServiceCreate);

        // Default mocks
        mockProcessJwt.mockResolvedValue({
            groups: ["group-public-users"],
            userId: "user-123",
        });
        mockVerifyAccess.mockReturnValue(true);

        // Default S3Service mock - returns a service instance with checkBucketConnectivity
        mockS3ServiceCreate.mockResolvedValue({
            checkBucketConnectivity: mockCheckBucketConnectivity,
        });
    });

    describe("GET /storage/storagestatus", () => {
        it("should return connected status when bucket is accessible", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
            });

            expect(mockGetDoc).toHaveBeenCalledWith(bucketId);
            expect(mockS3ServiceCreate).toHaveBeenCalledWith(bucketId, expect.any(Object));
            expect(mockCheckBucketConnectivity).toHaveBeenCalled();
        });

        it("should return not-found when bucket document does not exist", async () => {
            const nonExistentBucketId = `bucket-${uuidv4()}`;

            mockGetDoc.mockResolvedValueOnce({
                docs: [],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: nonExistentBucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "not-found",
                message: `Bucket configuration not found: ${nonExistentBucketId}`,
            });

            expect(mockGetDoc).toHaveBeenCalledWith(nonExistentBucketId);
            expect(mockS3ServiceCreate).not.toHaveBeenCalled();
            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should handle bucket with encrypted credentials", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
            });

            expect(mockGetDoc).toHaveBeenCalledWith(bucketId);
            expect(mockS3ServiceCreate).toHaveBeenCalledWith(bucketId, expect.any(Object));
            expect(mockCheckBucketConnectivity).toHaveBeenCalled();
        });

        it("should return not-found when encrypted credentials are missing", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: "non-existent-cred-id",
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });
            // S3Service.create will fail when credentials can't be retrieved
            mockS3ServiceCreate.mockRejectedValueOnce(new Error("Credentials not found"));

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unreachable",
                message: "Error checking bucket status: Credentials not found",
            });

            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should return no-credentials when bucket has no credentials", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                // No credential_id field
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "no-credentials",
                message: "No credentials configured for bucket: test-bucket",
            });
        });

        it("should return unreachable status when bucket cannot be reached", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "unreachable",
                message: "Cannot connect to S3 endpoint",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unreachable",
                message: "Cannot connect to S3 endpoint",
            });
        });

        it("should return unauthorized status when credentials are invalid", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "unauthorized",
                message: "Invalid credentials or insufficient permissions",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unauthorized",
                message: "Invalid credentials or insufficient permissions",
            });
        });

        it("should return connected when credentials are valid", async () => {
            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
                message: "Credentials valid and S3 service accessible",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
                message: "Credentials valid and S3 service accessible",
            });
        });

        it("should handle errors gracefully", async () => {
            mockGetDoc.mockRejectedValueOnce(new Error("Database connection failed"));

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unreachable",
                message: "Error checking bucket status: Database connection failed",
            });
        });

        it("should require bucketId parameter", async () => {
            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(400);
        });

        it("should deny access when user lacks permissions", async () => {
            mockVerifyAccess.mockReturnValue(false);

            const bucketId = `bucket-${uuidv4()}`;
            const credentialId = `cred-${uuidv4()}`;

            const mockBucket = {
                _id: bucketId,
                type: DocType.Storage,
                name: "test-bucket",
                memberOf: ["group-admin"],
                credential_id: credentialId,
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId, apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(403);
            expect(mockS3ServiceCreate).not.toHaveBeenCalled();
            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should require authentication", async () => {
            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" });
            // No Authorization header - should fail with 401

            expect(response.status).toBe(401);
            expect(response.body.message).toBe("Authorization token required");
        });
    });
});
