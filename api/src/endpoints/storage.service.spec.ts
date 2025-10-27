import { Test, TestingModule } from "@nestjs/testing";
import { StorageService } from "./storage.service";
import { DbService } from "../db/db.service";
import { S3Service } from "../s3/s3.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { S3BucketDto } from "../dto/S3BucketDto";
import { EncryptedStorageDto } from "../dto/EncryptedStorageDto";
import * as jwtUtils from "../jwt/processJwt";
import * as encryptionUtils from "../util/encryption";

jest.mock("../jwt/processJwt");
jest.mock("../util/encryption");

describe("StorageService", () => {
    let service: StorageService;
    let dbService: jest.Mocked<DbService>;
    let s3Service: jest.Mocked<S3Service>;

    const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StorageService,
                {
                    provide: DbService,
                    useValue: {
                        getDoc: jest.fn(),
                    },
                },
                {
                    provide: S3Service,
                    useValue: {
                        checkBucketConnectivity: jest.fn(),
                    },
                },
                {
                    provide: WINSTON_MODULE_PROVIDER,
                    useValue: mockLogger,
                },
            ],
        }).compile();

        service = module.get<StorageService>(StorageService);
        dbService = module.get<DbService>(DbService) as jest.Mocked<DbService>;
        s3Service = module.get<S3Service>(S3Service) as jest.Mocked<S3Service>;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (jwtUtils.processJwt as jest.Mock).mockResolvedValue({ userId: "test-user" });
    });

    it("should be defined", () => {
        expect(service).toBeDefined();
    });

    it("should return not-found for non-existent bucket", async () => {
        dbService.getDoc.mockResolvedValue({ docs: [] });

        const result = await service.checkBucketStatus("bucket-123", "token");

        expect(result).toEqual({
            bucketId: "bucket-123",
            status: "not-found",
            message: "Bucket document not found",
        });
    });

    it("should check connectivity with embedded credentials", async () => {
        const mockBucket: S3BucketDto = {
            _id: "bucket-123",
            name: "test-bucket",
            credential: {
                endpoint: "http://test.com",
                accessKey: "access",
                secretKey: "secret",
            },
        } as S3BucketDto;

        dbService.getDoc.mockResolvedValue({ docs: [mockBucket] });
        s3Service.checkBucketConnectivity.mockResolvedValue({
            status: "connected",
        });

        const result = await service.checkBucketStatus("bucket-123", "token");

        expect(s3Service.checkBucketConnectivity).toHaveBeenCalledWith(
            {
                endpoint: "http://test.com",
                accessKey: "access",
                secretKey: "secret",
            },
            "test-bucket",
        );

        expect(result).toEqual({
            bucketId: "bucket-123",
            status: "connected",
        });
    });

    it("should check connectivity with encrypted credentials", async () => {
        const mockBucket: S3BucketDto = {
            _id: "bucket-123",
            name: "test-bucket",
            credential_id: "cred-123",
        } as S3BucketDto;

        const mockEncryptedStorage: EncryptedStorageDto = {
            _id: "cred-123",
            data: {
                endpoint: "http://test.com",
                accessKey: "encrypted-access",
                secretKey: "encrypted-secret",
            },
        } as EncryptedStorageDto;

        dbService.getDoc
            .mockResolvedValueOnce({ docs: [mockBucket] })
            .mockResolvedValueOnce({ docs: [mockEncryptedStorage] });

        (encryptionUtils.decrypt as jest.Mock)
            .mockResolvedValueOnce("decrypted-access")
            .mockResolvedValueOnce("decrypted-secret");

        s3Service.checkBucketConnectivity.mockResolvedValue({
            status: "connected",
        });

        const result = await service.checkBucketStatus("bucket-123", "token");

        expect(s3Service.checkBucketConnectivity).toHaveBeenCalledWith(
            {
                endpoint: "http://test.com",
                accessKey: "decrypted-access",
                secretKey: "decrypted-secret",
            },
            "test-bucket",
        );

        expect(result).toEqual({
            bucketId: "bucket-123",
            status: "connected",
        });
    });

    it("should return no-credentials when no credentials are available", async () => {
        const mockBucket: S3BucketDto = {
            _id: "bucket-123",
            name: "test-bucket",
        } as S3BucketDto;

        dbService.getDoc.mockResolvedValue({ docs: [mockBucket] });

        const result = await service.checkBucketStatus("bucket-123", "token");

        expect(result).toEqual({
            bucketId: "bucket-123",
            status: "no-credentials",
            message: "No credentials configured for bucket",
        });
    });

    it("should handle errors gracefully", async () => {
        dbService.getDoc.mockRejectedValue(new Error("Database error"));

        const result = await service.checkBucketStatus("bucket-123", "token");

        expect(result).toEqual({
            bucketId: "bucket-123",
            status: "unreachable",
            message: "Error checking bucket: Database error",
        });
    });
});
