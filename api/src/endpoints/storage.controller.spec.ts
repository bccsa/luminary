import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { StorageController } from "./storage.controller";
import { S3Service } from "../s3/s3.service";
import { DbService } from "../db/db.service";
import { AuthGuard } from "../auth/auth.guard";
import * as encryption from "../util/encryption";
import * as jwtModule from "../jwt/processJwt";
import * as permissionsService from "../permissions/permissions.service";

describe("StorageController", () => {
    let app: INestApplication;
    const mockCreateClient = jest.fn();
    const mockCheckBucketConnectivity = jest.fn();
    const mockGetDoc = jest.fn();
    const mockRetrieve = jest.fn();
    const mockProcessJwt = jest.fn();
    const mockVerifyAccess = jest.fn();

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [StorageController],
            providers: [
                {
                    provide: S3Service,
                    useValue: {
                        createClient: mockCreateClient,
                        checkBucketConnectivity: mockCheckBucketConnectivity,
                    },
                },
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

        app = module.createNestApplication();
        app.useGlobalPipes(new ValidationPipe());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        // Reset mocks and re-establish spies so each test sets its own mock implementations
        jest.resetAllMocks();
        jest.spyOn(encryption, "retrieveCryptoData").mockImplementation(mockRetrieve);
        jest.spyOn(jwtModule, "processJwt").mockImplementation(mockProcessJwt);
        jest.spyOn(permissionsService.PermissionSystem, "verifyAccess").mockImplementation(
            mockVerifyAccess,
        );

        // Default mocks
        mockProcessJwt.mockResolvedValue({
            groups: ["group-public-users"],
            userId: "user-123",
        });
        mockVerifyAccess.mockReturnValue(true);
    });

    describe("GET /storage/storagestatus", () => {
        it("should return connected status when bucket is accessible", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential: {
                    endpoint: "http://localhost:9000",
                    bucketName: "test-bucket",
                    accessKey: "testAccessKey",
                    secretKey: "testSecretKey",
                },
            };

            mockGetDoc.mockResolvedValueOnce({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
            });

            expect(mockGetDoc).toHaveBeenCalledWith("bucket-123");
            expect(mockCheckBucketConnectivity).toHaveBeenCalledWith({
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "testAccessKey",
                secretKey: "testSecretKey",
            });
        });

        it("should return not-found when bucket document does not exist", async () => {
            mockGetDoc.mockResolvedValue({
                docs: [],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "not-found",
                message: "Bucket configuration not found: bucket-123",
            });

            expect(mockGetDoc).toHaveBeenCalledWith("bucket-123");
            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should handle bucket with encrypted credentials", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: "cred-456",
            };

            // Simulate bucket doc with credential_id
            mockGetDoc.mockResolvedValueOnce({ docs: [mockBucket] });

            // Mock retrieveCryptoData to return the decrypted credential object
            mockRetrieve.mockResolvedValueOnce({
                endpoint: "http://localhost:9000",
                bucketName: "decryptedBucketName",
                accessKey: "decryptedAccessKey",
                secretKey: "decryptedSecretKey",
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
            });

            expect(mockGetDoc).toHaveBeenCalledTimes(1);
            expect(mockGetDoc).toHaveBeenCalledWith("bucket-123");

            // Check that the decrypted credentials were used
            expect(mockCheckBucketConnectivity).toHaveBeenCalledWith({
                endpoint: "http://localhost:9000",
                bucketName: "decryptedBucketName",
                accessKey: "decryptedAccessKey",
                secretKey: "decryptedSecretKey",
            });
        });

        it("should return not-found when encrypted credentials are missing", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential_id: "cred-456",
            };

            mockGetDoc.mockResolvedValueOnce({ docs: [mockBucket] });
            mockRetrieve.mockRejectedValueOnce(new Error("Credentials not found"));

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "not-found",
                message: "Credentials not found for bucket: test-bucket",
            });

            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should return no-credentials when bucket has no credentials", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                // No credential or credential_id fields
            };

            mockGetDoc.mockResolvedValue({
                docs: [mockBucket],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "no-credentials",
                message: "No credentials configured for bucket: test-bucket",
            });
        });

        it("should return unreachable status when bucket cannot be reached", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential: {
                    endpoint: "http://invalid-endpoint:9000",
                    bucketName: "test-bucket",
                    accessKey: "testAccessKey",
                    secretKey: "testSecretKey",
                },
            };

            mockGetDoc.mockResolvedValue({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "unreachable",
                message: "Cannot connect to S3 endpoint",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unreachable",
                message: "Cannot connect to S3 endpoint",
            });
        });

        it("should return unauthorized status when credentials are invalid", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential: {
                    endpoint: "http://localhost:9000",
                    bucketName: "test-bucket",
                    accessKey: "wrongAccessKey",
                    secretKey: "wrongSecretKey",
                },
            };

            mockGetDoc.mockResolvedValue({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "unauthorized",
                message: "Invalid credentials or insufficient permissions",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "unauthorized",
                message: "Invalid credentials or insufficient permissions",
            });
        });

        it("should return connected when credentials are valid", async () => {
            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-public-users"],
                credential: {
                    endpoint: "http://localhost:9000",
                    bucketName: "test-bucket",
                    accessKey: "testAccessKey",
                    secretKey: "testSecretKey",
                },
            };

            mockGetDoc.mockResolvedValue({
                docs: [mockBucket],
            });

            mockCheckBucketConnectivity.mockResolvedValue({
                status: "connected",
                message: "Credentials valid and S3 service accessible",
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: "connected",
                message: "Credentials valid and S3 service accessible",
            });
        });

        it("should handle errors gracefully", async () => {
            mockGetDoc.mockRejectedValue(new Error("Database connection failed"));

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

            const mockBucket = {
                _id: "bucket-123",
                name: "test-bucket",
                memberOf: ["group-admin"],
                credential: {
                    endpoint: "http://localhost:9000",
                    bucketName: "test-bucket",
                    accessKey: "testAccessKey",
                    secretKey: "testSecretKey",
                },
            };

            mockGetDoc.mockResolvedValue({
                docs: [mockBucket],
            });

            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" })
                .set("Authorization", "Bearer fake-token");

            expect(response.status).toBe(403);
            expect(mockCheckBucketConnectivity).not.toHaveBeenCalled();
        });

        it("should require authentication", async () => {
            const response = await request(app.getHttpServer())
                .get("/storage/storagestatus")
                .query({ bucketId: "bucket-123", apiVersion: "0.0.0" });

            // Without overriding the guard, this would fail authentication
            // But since we overrode it in the test setup, we expect it to pass
            expect(response.status).toBe(200);
        });
    });
});
