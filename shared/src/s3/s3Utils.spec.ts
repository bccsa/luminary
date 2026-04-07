import { describe, it, expect } from "vitest";
import { validateS3CredentialsFormat, testS3Credentials } from "./s3Utils";
import type { S3TestCredentialsInput } from "./s3Utils";

const validCredentials: S3TestCredentialsInput = {
    endpoint: "https://s3.example.com",
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucketName: "my-test-bucket",
};

describe("validateS3CredentialsFormat", () => {
    it("returns null for valid credentials", () => {
        expect(validateS3CredentialsFormat(validCredentials)).toBeNull();
    });

    it("returns error when endpoint is missing", () => {
        expect(validateS3CredentialsFormat({ ...validCredentials, endpoint: "" })).toBe(
            "Endpoint is required",
        );
    });

    it("returns error when accessKey is missing", () => {
        expect(validateS3CredentialsFormat({ ...validCredentials, accessKey: "" })).toBe(
            "Access key is required",
        );
    });

    it("returns error when secretKey is missing", () => {
        expect(validateS3CredentialsFormat({ ...validCredentials, secretKey: "" })).toBe(
            "Secret key is required",
        );
    });

    it("returns error when bucketName is missing", () => {
        expect(validateS3CredentialsFormat({ ...validCredentials, bucketName: "" })).toBe(
            "Bucket name is required",
        );
    });

    it("returns error for invalid endpoint URL", () => {
        expect(
            validateS3CredentialsFormat({ ...validCredentials, endpoint: "not-a-url" }),
        ).toBe("Invalid endpoint URL format");
    });

    it("returns error for uppercase bucket name", () => {
        const result = validateS3CredentialsFormat({ ...validCredentials, bucketName: "MyBucket" });
        expect(result).toContain("Invalid bucket name format");
    });

    it("returns error for bucket name with special characters", () => {
        const result = validateS3CredentialsFormat({
            ...validCredentials,
            bucketName: "my_bucket!",
        });
        expect(result).toContain("Invalid bucket name format");
    });

    it("returns error for bucket name shorter than 3 characters", () => {
        const result = validateS3CredentialsFormat({ ...validCredentials, bucketName: "ab" });
        // "ab" fails regex (needs start + end char), so it hits format error first
        expect(result).not.toBeNull();
    });

    it("returns error for bucket name longer than 63 characters", () => {
        const longName = "a".repeat(64);
        const result = validateS3CredentialsFormat({ ...validCredentials, bucketName: longName });
        expect(result).toBe("Bucket name must be between 3 and 63 characters long.");
    });

    it("returns error for single character bucket name", () => {
        const result = validateS3CredentialsFormat({ ...validCredentials, bucketName: "a" });
        expect(result).not.toBeNull();
    });
});

describe("testS3Credentials", () => {
    it("returns success for valid credentials", async () => {
        const result = await testS3Credentials(validCredentials);
        expect(result.status).toBe("success");
        expect(result.message).toContain("valid");
    });

    it("returns format validation error first", async () => {
        const result = await testS3Credentials({ ...validCredentials, endpoint: "" });
        expect(result.status).toBe("error");
        expect(result.message).toBe("Endpoint is required");
    });

    it("returns error for invalid URL protocol", async () => {
        const result = await testS3Credentials({
            ...validCredentials,
            endpoint: "ftp://s3.example.com",
        });
        expect(result.status).toBe("error");
        expect(result.message).toBe("Invalid endpoint URL format");
    });

    it("returns error for short accessKey", async () => {
        const result = await testS3Credentials({
            ...validCredentials,
            accessKey: "ab",
        });
        expect(result.status).toBe("error");
        expect(result.message).toContain("Access key");
    });

    it("returns error for short secretKey", async () => {
        const result = await testS3Credentials({
            ...validCredentials,
            secretKey: "short",
        });
        expect(result.status).toBe("error");
        expect(result.message).toContain("Secret key");
    });

    it("returns error for invalid endpoint URL format", async () => {
        // Pass format validation (endpoint is non-empty) but fail URL parsing
        const result = await testS3Credentials({
            ...validCredentials,
            endpoint: "not-a-valid-url",
        });
        expect(result.status).toBe("error");
    });
});
