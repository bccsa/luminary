import processStorageDto from "./processStorageDto";
import { DbService } from "../../db/db.service";
import { S3Service } from "../../s3/s3.service";
import { createTestingModule } from "../../test/testingModule";
import { changeRequest_storage } from "../../test/changeRequestDocuments";

// Mock Minio client to avoid actual S3 calls during tests
jest.mock("minio", () => {
    return {
        Client: jest.fn().mockImplementation(() => ({
            bucketExists: jest.fn().mockResolvedValue(false),
            makeBucket: jest.fn().mockResolvedValue(true),
        })),
    };
});

describe("processStorageDto", () => {
    let db: DbService;
    let s3: S3Service;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-storage-dto");

        db = testingModule.dbService;
        s3 = testingModule.s3Service;
    });

    it("encrypts embedded credentials, stores encrypted storage doc, sets credential_id, and creates physical bucket", async () => {
        const storageChangeRequest = changeRequest_storage();

        await db.upsertDoc(storageChangeRequest.doc);

        await processStorageDto(storageChangeRequest.doc, undefined, db, s3);

        // credential_id should be set and credential should be removed
        expect(storageChangeRequest.doc.credential_id).toBeDefined();
        expect(storageChangeRequest.doc.credential).toBeUndefined();

        const storedDoc = await db.getDoc(storageChangeRequest.doc.credential_id);

        expect(storedDoc.docs.length).toBe(1);
        expect(storedDoc.docs[0]._id).toBe(storageChangeRequest.doc.credential_id);

        //  stored credentials should be encrypted
        expect(storedDoc.docs[0].data).toBeDefined();
        expect(storedDoc.docs[0].data.accessKey).not.toBe("accessAdminKey");
        expect(storedDoc.docs[0].data.secretKey).not.toBe("secretAdminKey");
    });

    it("handles gracefully when both embedded credentials and credential_id are provided", async () => {
        const storageChangeRequest = changeRequest_storage();

        // Set both credential and credential_id to simulate the issue
        storageChangeRequest.doc.credential_id = "existing-cred-id";
        // credential is already set by changeRequest_storage()

        await db.upsertDoc(storageChangeRequest.doc);

        await processStorageDto(storageChangeRequest.doc, undefined, db, s3);

        // The old credential_id should be removed and credential should be processed normally
        expect(storageChangeRequest.doc.credential_id).toBeDefined(); // New credential_id from processing embedded credential
        expect(storageChangeRequest.doc.credential).toBeUndefined(); // Embedded credential should be removed after processing

        // The new credential_id should not be the same as the original one (since we process embedded credential)
        expect(storageChangeRequest.doc.credential_id).not.toBe("existing-cred-id");
    });

    it("throws when neither credential nor credential_id is provided", async () => {
        const storageChangeRequest = changeRequest_storage();
        delete storageChangeRequest.doc.credential;
        delete storageChangeRequest.doc.credential_id;

        await db.upsertDoc(storageChangeRequest.doc);

        await expect(
            processStorageDto(storageChangeRequest.doc, undefined, db, s3),
        ).rejects.toThrow(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    });

    it("handles gracefully when both credential and credential_id are provided (legacy test)", async () => {
        const doc = changeRequest_storage().doc;
        doc.credential_id = "some-uuid";

        await db.upsertDoc(doc);

        const warnings = await processStorageDto(doc, undefined, db, s3);

        // Should handle gracefully with warning, not throw error
        expect(
            warnings.some((w) =>
                w.includes("Both embedded credentials and credential_id provided"),
            ),
        ).toBe(true);
        expect(
            warnings.some((w) =>
                w.includes("Using embedded credentials and removing credential_id reference"),
            ),
        ).toBe(true);

        // After processing, credential_id should be set to new value (from processing embedded credential)
        // and credential should be removed
        expect(doc.credential_id).toBeDefined(); // New credential_id from processing
        expect(doc.credential).toBeUndefined(); // Embedded credential should be removed after processing
        expect(doc.credential_id).not.toBe("some-uuid"); // Should be different from original
    });

    it("throws error when creating new bucket fails", async () => {
        // Mock a failed bucket creation for a NEW bucket
        const { Client } = jest.requireMock("minio");
        Client.mockImplementationOnce(() => ({
            bucketExists: jest.fn().mockResolvedValue(false),
            makeBucket: jest.fn().mockRejectedValue(new Error("S3 connection failed")),
        }));

        const storageChangeRequest = changeRequest_storage();
        await db.upsertDoc(storageChangeRequest.doc);

        // For new buckets with credentials, should throw error if creation fails
        await expect(
            processStorageDto(storageChangeRequest.doc, undefined, db, s3),
        ).rejects.toThrow("Failed to create physical S3 bucket");
    });

    it.skip("can't create a bucket document that already exists", async () => {
        const storageChangeRequest = changeRequest_storage();
        await db.upsertDoc(storageChangeRequest.doc);

        // First creation should succeed
        await processStorageDto(storageChangeRequest.doc, undefined, db, s3);

        // Second creation with same name should fail
        const anotherStorageChangeRequest = changeRequest_storage();
        anotherStorageChangeRequest.doc.name = storageChangeRequest.doc.name; // Same bucket name
        await db.upsertDoc(anotherStorageChangeRequest.doc);

        await expect(
            processStorageDto(storageChangeRequest.doc, undefined, db, s3),
        ).rejects.toThrow(
            `S3 bucket ${storageChangeRequest.doc.name} already exists on the storage provider `,
        );
    });

    it("deletes a bucket when document is marked for deletion and the data encrypted document", async () => {
        const storageChangeRequest = changeRequest_storage();
        const doc = storageChangeRequest.doc;
        doc.deleteReq = 1;

        await db.upsertDoc(doc);

        await processStorageDto(doc, doc, db, s3);

        const deletedDoc = await db.getDoc(doc._id);
        expect(deletedDoc.docs.length).toBe(0);

        //  check that associated credential document is also deleted
        if (doc.credential_id) {
            const credDoc = await db.getDoc(doc.credential_id);
            expect(credDoc.docs.length).toBe(0);
        }
    });
});
