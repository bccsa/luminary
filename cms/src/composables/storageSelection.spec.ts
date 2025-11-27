import { describe, it, expect, beforeEach } from "vitest";
import { ref, type Ref } from "vue";
import { storageValidation } from "./storageValidation";
import type { StorageDto, S3CredentialDto } from "luminary-shared";
import { DocType, StorageType } from "luminary-shared";

describe("useBucketValidation", () => {
    let bucket: ReturnType<typeof ref<StorageDto | undefined>>;
    let localCredentials: Ref<S3CredentialDto>;
    let isEditing: Ref<boolean>;

    beforeEach(() => {
        bucket = ref<StorageDto>({
            _id: "storage-test",
            type: DocType.Storage,
            updatedTimeUtc: Date.now(),
            memberOf: [],
            name: "",
            StorageType: StorageType.Image,
            publicUrl: "",
            mimeTypes: [],
        });

        localCredentials = ref({
            endpoint: "",
            bucketName: "",
            accessKey: "",
            secretKey: "",
        }) as Ref<S3CredentialDto>;

        isEditing = ref(false) as Ref<boolean>;
    });

    describe("Bucket Name Validation", () => {
        it("should invalidate empty bucket name", () => {
            const { validations, isFormValid } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            const nameValidation = validations.value.find((v) => v.id === "bucketName");
            expect(nameValidation?.isValid).toBe(false);
            expect(isFormValid.value).toBe(false);
        });

        it("should validate bucket name with valid format", () => {
            bucket.value!.name = "My Bucket";
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const nameValidation = validations.value.find((v) => v.id === "bucketName");
            const formatValidation = validations.value.find((v) => v.id === "bucketNameFormat");

            expect(nameValidation?.isValid).toBe(true);
            expect(formatValidation?.isValid).toBe(true);
        });

        it("should invalidate bucket name shorter than 3 characters", () => {
            bucket.value!.name = "AB";

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "bucketNameFormat");
            expect(formatValidation?.isValid).toBe(false);
        });

        it("should invalidate bucket name longer than 63 characters", () => {
            bucket.value!.name = "a".repeat(64);

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "bucketNameFormat");
            expect(formatValidation?.isValid).toBe(false);
        });

        it("should invalidate bucket name with invalid characters", () => {
            bucket.value!.name = "Invalid@Bucket!Name";

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "bucketNameFormat");
            expect(formatValidation?.isValid).toBe(false);
        });

        it("should allow alphanumeric, spaces, hyphens, and periods", () => {
            bucket.value!.name = "My-Bucket.v1 2024";
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "bucketNameFormat");
            expect(formatValidation?.isValid).toBe(true);
        });
    });

    describe("Public URL Validation", () => {
        it("should invalidate empty public URL", () => {
            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const urlValidation = validations.value.find((v) => v.id === "publicUrl");
            expect(urlValidation?.isValid).toBe(false);
        });

        it("should validate URL starting with http://", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000/bucket";
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const urlValidation = validations.value.find((v) => v.id === "publicUrl");
            const formatValidation = validations.value.find((v) => v.id === "publicUrlFormat");

            expect(urlValidation?.isValid).toBe(true);
            expect(formatValidation?.isValid).toBe(true);
        });

        it("should validate URL starting with https://", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "https://s3.amazonaws.com/bucket";
            localCredentials.value = {
                endpoint: "https://s3.amazonaws.com",
                bucketName: "test-bucket",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "publicUrlFormat");
            expect(formatValidation?.isValid).toBe(true);
        });

        it("should invalidate URL without http:// or https://", () => {
            bucket.value!.publicUrl = "localhost:9000/bucket";

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "publicUrlFormat");
            expect(formatValidation?.isValid).toBe(false);
        });
    });

    describe("Credentials Validation - New Bucket", () => {
        it("should require credentials for new buckets", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = false;

            const { validations, isFormValid } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            const credsValidation = validations.value.find((v) => v.id === "credentialsRequired");
            expect(credsValidation?.isValid).toBe(false);
            expect(isFormValid.value).toBe(false);
        });

        it("should validate when all credentials are provided for new bucket", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = false;
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key123",
                secretKey: "secret456",
            };

            const { isFormValid, hasValidCredentials } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasValidCredentials.value).toBe(true);
            expect(isFormValid.value).toBe(true);
        });

        it("should invalidate partial credentials for new bucket", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = false;
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "",
                accessKey: "",
                secretKey: "",
            };

            const { hasValidCredentials, hasPartialCredentials } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasPartialCredentials.value).toBe(true);
            expect(hasValidCredentials.value).toBe(false);
        });
    });

    describe("Credentials Validation - Editing", () => {
        it("should not require credentials when editing", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = true;

            const { validations, isFormValid } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            const credsValidation = validations.value.find((v) => v.id === "credentialsRequired");
            expect(credsValidation).toBeUndefined();
            expect(isFormValid.value).toBe(true);
        });

        it("should validate complete credentials when editing", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = true;
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key123",
                secretKey: "secret456",
            };

            const { hasValidCredentials, isFormValid } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasValidCredentials.value).toBe(true);
            expect(isFormValid.value).toBe(true);
        });

        it("should invalidate partial credentials when editing", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            isEditing.value = true;
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "",
                accessKey: "key123",
                secretKey: "",
            };

            const { hasValidCredentials, hasPartialCredentials, isFormValid } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasPartialCredentials.value).toBe(true);
            expect(hasValidCredentials.value).toBe(false);
            // Form should be invalid because partial credentials are not allowed
            // If credentials are provided, all fields must be filled
            expect(isFormValid.value).toBe(false);
        });
    });

    describe("Endpoint Format Validation", () => {
        it("should validate endpoint with http://", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "endpointFormat");
            expect(formatValidation?.isValid).toBe(true);
        });

        it("should validate endpoint with https://", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "https://s3.amazonaws.com";
            localCredentials.value = {
                endpoint: "https://s3.amazonaws.com",
                bucketName: "test",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "endpointFormat");
            expect(formatValidation?.isValid).toBe(true);
        });

        it("should invalidate endpoint without protocol", () => {
            bucket.value!.name = "Test";
            bucket.value!.publicUrl = "http://localhost:9000";
            localCredentials.value = {
                endpoint: "localhost:9000",
                bucketName: "test",
                accessKey: "key",
                secretKey: "secret",
            };

            const { validations } = storageValidation(bucket, localCredentials, isEditing);

            const formatValidation = validations.value.find((v) => v.id === "endpointFormat");
            expect(formatValidation?.isValid).toBe(false);
        });
    });

    describe("Field Tracking", () => {
        it("should mark fields as touched", () => {
            const { touchField, touchedFields } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            touchField("bucketName");
            touchField("publicUrl");

            expect(touchedFields.value.has("bucketName")).toBe(true);
            expect(touchedFields.value.has("publicUrl")).toBe(true);
            expect(touchedFields.value.has("endpoint")).toBe(false);
        });

        it("should show field errors only for touched fields", () => {
            const { touchField, hasFieldError } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            // Before touching
            expect(hasFieldError("bucketName")).toBe(false);

            // After touching
            touchField("bucketName");
            expect(hasFieldError("bucketName")).toBe(true);
        });

        it("should show all errors after submit attempt", () => {
            const { hasFieldError, hasAttemptedSubmit } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            // Before submit attempt
            expect(hasFieldError("bucketName")).toBe(false);

            // After submit attempt
            hasAttemptedSubmit.value = true;
            expect(hasFieldError("bucketName")).toBe(true);
        });

        it("should reset validation state", () => {
            const { touchField, hasAttemptedSubmit, resetValidation, touchedFields } =
                storageValidation(bucket, localCredentials, isEditing);

            touchField("bucketName");
            hasAttemptedSubmit.value = true;

            resetValidation();

            expect(hasAttemptedSubmit.value).toBe(false);
            expect(touchedFields.value.size).toBe(0);
        });
    });

    describe("Credential State Helpers", () => {
        it("should detect complete credentials", () => {
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "test-bucket",
                accessKey: "key123",
                secretKey: "secret456",
            };

            const { hasCompleteCredentials } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasCompleteCredentials.value).toBe(true);
        });

        it("should detect partial credentials", () => {
            localCredentials.value = {
                endpoint: "http://localhost:9000",
                bucketName: "",
                accessKey: "",
                secretKey: "",
            };

            const { hasPartialCredentials } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasPartialCredentials.value).toBe(true);
        });

        it("should detect no credentials", () => {
            localCredentials.value = {
                endpoint: "",
                bucketName: "",
                accessKey: "",
                secretKey: "",
            };

            const { hasPartialCredentials, hasCompleteCredentials } = storageValidation(
                bucket,
                localCredentials,
                isEditing,
            );

            expect(hasPartialCredentials.value).toBe(false);
            expect(hasCompleteCredentials.value).toBe(false);
        });
    });
});
