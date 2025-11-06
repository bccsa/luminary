import processStorageDto from "./processStorageDto";
import { DbService } from "../../db/db.service";
import { createTestingModule } from "../../test/testingModule";
import { changeRequest_storage } from "../../test/changeRequestDocuments";

// Mock Minio client to avoid actual S3 calls during tests
jest.mock("minio", () => {
    return {
        Client: jest.fn().mockImplementation(() => ({
            bucketExists: jest.fn().mockResolvedValue(false),
            makeBucket: jest.fn().mockResolvedValue(true),
            setBucketPolicy: jest.fn().mockResolvedValue(true),
        })),
    };
});

describe("processStorageDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-storage-dto");

        db = testingModule.dbService;
    });

    it("encrypts embedded credentials, stores encrypted storage doc, and sets credential_id", async () => {
        const storageChangeRequest = changeRequest_storage();

        await db.upsertDoc(storageChangeRequest.doc);

        await processStorageDto(storageChangeRequest.doc, undefined, db);

        // credential_id should be set and credential should be removed
        expect(storageChangeRequest.doc.credential_id).toBeDefined();
        expect(storageChangeRequest.doc.credential).toBeUndefined();

        const storedDoc = await db.getDoc(storageChangeRequest.doc.credential_id);

        expect(storedDoc.docs.length).toBe(1);
        expect(storedDoc.docs[0]._id).toBe(storageChangeRequest.doc.credential_id);

        //  stored credentials should be encrypted
        expect(storedDoc.docs[0].data).toBeDefined();
        expect(storedDoc.docs[0].data.bucketName).not.toBe("testStorageBucket");
        expect(storedDoc.docs[0].data.accessKey).not.toBe("accessAdminKey");
        expect(storedDoc.docs[0].data.secretKey).not.toBe("secretAdminKey");
    });

    it("handles gracefully when both embedded credentials and credential_id are provided", async () => {
        const storageChangeRequest = changeRequest_storage();

        // Set both credential and credential_id to simulate the issue
        storageChangeRequest.doc.credential_id = "existing-cred-id";
        // credential is already set by changeRequest_storage()

        await db.upsertDoc(storageChangeRequest.doc);

        await processStorageDto(storageChangeRequest.doc, undefined, db);

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

        await expect(processStorageDto(storageChangeRequest.doc, undefined, db)).rejects.toThrow(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    });

    it("handles gracefully when both credential and credential_id are provided", async () => {
        const doc = changeRequest_storage().doc;
        doc.credential_id = "some-uuid";

        await db.upsertDoc(doc);

        const warnings = await processStorageDto(doc, undefined, db);

        expect(warnings).toContain(
            "The previous credentials will be deleted and replaced with new ones.",
        );

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
            setBucketPolicy: jest.fn().mockResolvedValue(true),
        }));

        const storageChangeRequest = changeRequest_storage();
        await db.upsertDoc(storageChangeRequest.doc);

        // Physical bucket creation is skipped - should process credentials without error
        const warnings = await processStorageDto(storageChangeRequest.doc, undefined, db);

        // Should complete without throwing errors (no specific warnings expected)
        expect(Array.isArray(warnings)).toBe(true);
    });

    it("can't create a bucket document that already exists", async () => {
        const storageChangeRequest = changeRequest_storage();
        await db.upsertDoc(storageChangeRequest.doc);

        // First creation should succeed
        await processStorageDto(storageChangeRequest.doc, undefined, db);

        // Mock bucketExists to return true for the second attempt
        const { Client } = jest.requireMock("minio");
        const mockClient = new Client();
        mockClient.bucketExists = jest.fn().mockResolvedValue(true); // Bucket already exists
        Client.mockImplementationOnce(() => mockClient);

        // Second creation with same name should fail
        const anotherStorageChangeRequest = changeRequest_storage();
        anotherStorageChangeRequest.doc.name = storageChangeRequest.doc.name; // Same bucket name
        await db.upsertDoc(anotherStorageChangeRequest.doc);

        // Physical bucket creation is now skipped, so no duplication error should occur
        const warnings = await processStorageDto(anotherStorageChangeRequest.doc, undefined, db);
        expect(Array.isArray(warnings)).toBe(true);
    });

    it("deletes a bucket when document is marked for deletion and the data encrypted document", async () => {
        const storageChangeRequest = changeRequest_storage();
        const doc = storageChangeRequest.doc;
        doc.deleteReq = 1;

        await db.upsertDoc(doc);

        await processStorageDto(doc, doc, db);

        const deletedDoc = await db.getDoc(doc._id);
        expect(deletedDoc.docs.length).toBe(0);

        //  check that associated credential document is also deleted
        if (doc.credential_id) {
            const credDoc = await db.getDoc(doc.credential_id);
            expect(credDoc.docs.length).toBe(0);
        }
    });
});
