import processStorageDto from "./processStorageDto";
import { DbService } from "../../db/db.service";
import { createTestingModule } from "../../test/testingModule";
import { changeRequest_storage } from "../../test/changeRequestDocuments";

describe("processStorageDto", () => {
    let db: DbService;

    beforeAll(async () => {
        const testingModule = await createTestingModule("process-storage-dto");

        db = testingModule.dbService;
    });

    it("encrypts embedded credentials, stores encrypted storage doc and sets credential_id", async () => {
        const storageChangeRequest = changeRequest_storage();

        await db.upsertDoc(storageChangeRequest.doc);

        const warnings = await processStorageDto(storageChangeRequest.doc, undefined, db);

        expect(warnings.length).toBe(0);

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

    it("throws when neither credential nor credential_id is provided", async () => {
        const storageChangeRequest = changeRequest_storage();
        delete storageChangeRequest.doc.credential;
        delete storageChangeRequest.doc.credential_id;

        await db.upsertDoc(storageChangeRequest.doc);

        expect;
        await expect(processStorageDto(storageChangeRequest.doc, undefined, db)).rejects.toThrow(
            "S3 bucket must have either embedded credentials or a credential_id reference",
        );
    });

    it("throws when both credential and credential_id are provided", async () => {
        const doc = changeRequest_storage().doc;
        doc.credential_id = "some-uuid";

        await db.upsertDoc(doc);

        await expect(processStorageDto(doc, undefined, db)).rejects.toThrow(
            "S3 bucket has both embedded credentials and credential_id. Using credential_id reference.",
        );
    });

    // it("propagates encryption errors with a helpful message", async () => {
    //     const doc = {
    //         _id: "bucket-4",
    //         type: "storage",
    //         memberOf: ["group-1"],
    //         name: "FailBucket",
    //         httpPath: "/images",
    //         credential: {
    //             endpoint: "http://example.com",
    //             accessKey: "AKIA...",
    //             // secretKey: "secret",
    //         },
    //         fileTypes: [],
    //     } as unknown as S3BucketDto;

    //     await expect(processStorageDto(doc, undefined, db as DbService)).rejects.toThrow(
    //         /Failed to encrypt S3 credentials: crypto-failure/,
    //     );
    // });
});
