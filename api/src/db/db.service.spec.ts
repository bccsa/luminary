import { DbService, DbQueryResult } from "./db.service";
import { randomUUID } from "crypto";
import { DocType, Uuid } from "../enums";
import { createTestingModule } from "../test/testingModule";

describe("DbService", () => {
    let service: DbService;

    beforeAll(async () => {
        service = (await createTestingModule("db-service")).dbService;
    });

    it("can be instantiated", () => {
        expect(service).toBeDefined();
    });

    it("can read a single existing document", async () => {
        const res: any = await service.getDoc("user-public");

        expect(res.docs[0]._id).toBe("user-public");
    });

    it("can handle exceptions on reading non-exising documents", async () => {
        const res: any = await service.getDoc("non-existing-document");

        expect(res.docs.length).toBe(0);
    });

    it("can insert a new document and return the full document in the result's 'changes' field", async () => {
        const uuid = randomUUID();
        const doc = {
            _id: uuid,
            testData: "test123",
        };

        const res = await service.upsertDoc(doc);

        const testGet = (await service.getDoc(uuid)) as any;

        expect(testGet.docs[0]._id).toBe(uuid);
        expect(testGet.docs[0].testData).toBe("test123");
        expect(res.changes.testData).toBe("test123");
        expect(res.changes._id).toBe(uuid);
    });

    it("can calculate a document diff and return the diff with the upsert result", async () => {
        const doc1 = {
            _id: "diffTest",
            testData: "test123",
            unchangedData: "test123",
        };
        const doc2 = {
            _id: "diffTest",
            testData: "changedData123",
            unchangedData: "test123",
        };

        await service.upsertDoc(doc1);
        const res = await service.upsertDoc(doc2);

        expect(res.changes.testData).toBe("changedData123");
        expect(res.changes._id).toBe("diffTest");
        expect(res.changes.unchangedData).toBe(undefined);
    });

    it("cannot insert a new document without an id", async () => {
        const doc = {
            testData: "test123",
        };

        await expect(service.upsertDoc(doc)).rejects.toBe(
            "Invalid document: The passed document does not have an '_id' property",
        );
    });

    it("can update an existing document", async () => {
        const uuid = randomUUID();

        // Insert a document
        const originalDoc = {
            _id: uuid,
            testData: "test123",
        };
        await service.upsertDoc(originalDoc);

        // Update the document
        const changedDoc = {
            _id: uuid,
            testData: "changedData123",
        };
        await service.upsertDoc(changedDoc);

        const testGet = (await service.getDoc(uuid)) as any;

        expect(testGet.docs[0]._id).toBe(uuid);
        expect(testGet.docs[0].testData).toBe("changedData123");
    });

    it("can get the latest document updated time", async () => {
        // Add / update a document and check if the latest document update time is close to now.
        const doc = {
            _id: "docUpdateTimeTest",
            testData: "newData123",
        };
        await service.upsertDoc(doc);
        const newDoc = (await service.getDoc(doc._id)).docs[0];

        const res: number = await service.getLatestDocUpdatedTime();

        expect(res).toBe(newDoc.updatedTimeUtc);
    });

    it("can get the oldest changelogEntry document updated time", async () => {
        // This is difficult to test accurately as the updated time is generated on document insertion into the
        // database. We can at least check if it returns a number which is a valid timestamp (generated on 1
        // January 2024 or later);
        const res: number = await service.getOldestChangeTime();

        expect(res).toBeGreaterThan(1704067200); // 1 January 2024 00:00
        expect(res).toBeLessThan(Date.now());
    });

    it("can retrieve user's own document", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        const res: any = await service.getDocsPerGroup("user-public", {
            userAccess,
            from: 0,
        });

        expect(res.docs[0]._id).toBe("user-public");
        expect(res.docs.length).toBe(1);
    });

    it("can retrieve documents using one group selector", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content"];
        userAccess[DocType.Tag] = ["group-public-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: 0,
        });

        const docCount = res.docs.filter((t) => t.memberOf.includes("group-public-content")).length;
        expect(docCount).toBe(9);
    });

    it("can retrieve documents using two group selectors", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content", "group-private-content"];
        userAccess[DocType.Tag] = ["group-public-content", "group-private-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: 0,
        });

        const docCount =
            res.docs.filter((t) => t.memberOf.includes("group-public-content")).length +
            res.docs.filter((t) => t.memberOf.includes("group-private-content")).length;
        expect(docCount).toBe(18);
    });

    it("can retrieve documents of one type", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: 0,
        });

        const docCount = res.docs.filter((t) => t.type === DocType.Post).length;
        expect(docCount).toBe(1);
    });

    it("can retrieve documents of two types", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content"];
        userAccess[DocType.Tag] = ["group-public-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: 0,
        });

        const docCount =
            res.docs.filter((t) => t.type === DocType.Post).length +
            res.docs.filter((t) => t.type === DocType.Tag).length;
        expect(docCount).toBe(3);
    });

    it.skip("can retrieve documents from a given time", async () => {
        // This test is not valid anymore as sync tolerance is implemented with a default value of 1000ms. Probably need a bigger dataset to effectively test this.
        // Update a document and query documents from a timestamp just before the updated time.
        // Only one document should be returned (which is newer than the update time)
        const doc = {
            _id: "content-post1-eng",
            type: DocType.Content,
            memberOf: ["group-public-content"],
            language: "lang-eng",
            status: "published",
            slug: "post1-eng",
            title: "Post 1",
            summary: "This is an example post",
            author: "ChatGPT",
            text: "Unique text " + Date.now(),
            seo: "",
            localisedImage: "",
            audio: "",
            video: "",
            publishDate: 3,
            expiryDate: 0,
        };

        await service.upsertDoc(doc);
        const updatedDoc = (await service.getDoc(doc._id)).docs[0];

        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content"];
        userAccess[DocType.Tag] = ["group-public-content"];
        userAccess[DocType.Content] = ["group-public-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: updatedDoc.updatedTimeUtc,
        });

        expect(res.docs.length).toBe(1);
    });

    it("can retrieve the group itself from the passed groups query property", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Group] = ["group-public-content"];

        const res: any = await service.getDocsPerGroup("", {
            userAccess,
            from: 0,
        });

        const docCount = res.docs.filter((t) => t._id === "group-public-content").length;
        expect(docCount).toBe(1);
    });

    it("can get all groups", async () => {
        const res: any = await service.getGroups();

        const docCount = res.docs.length;
        expect(docCount).toBe(8);
    });

    it("can detect that a document is exactly the same as the document in the database", async () => {
        const doc = {
            _id: "docIdenticalTest",
            testData: "test123",
        };
        await service.upsertDoc(doc);
        const res: any = await service.upsertDoc(doc);
        expect(res.message).toBe("Document is identical to the one in the database");
    });

    it("can handle simultaneous updates to a single existing document", async () => {
        // Insert a document into the database to ensure there is an existing document
        await service.upsertDoc({ _id: "simultaneousTest", testVal: 0 });

        // Generate changes to the document and submit them in parallel
        const pList = new Array<Promise<any>>();

        for (let index = 1; index <= 50; index++) {
            pList.push(service.upsertDoc({ _id: "simultaneousTest", testVal: index }));
        }

        let res: boolean = false;
        await Promise.all(pList);

        // if we got past this point without an exception, the test was successful
        res = true;
        expect(res).toBe(true);
    }, 10000);

    it("can get a list of documents filtered by document ID and document type", async () => {
        // Test if we can return two documents with the passed IDs and valid document types
        const res: any = await service.getDocs(
            ["lang-eng", "user-public"],
            [DocType.Language, DocType.User],
        );

        expect(res.docs.length).toBe(2);
        expect(res.docs.some((d) => d._id === "lang-eng")).toBe(true);
        expect(res.docs.some((d) => d._id === "user-public")).toBe(true);

        // Test if we can return one document with a correct document type, while the other document is discarded due to an incorrect document type
        const res2: any = await service.getDocs(
            ["lang-eng", "user-public"],
            [DocType.Language, DocType.Group],
        );

        expect(res2.docs.length).toBe(1);
        expect(res2.docs.some((d) => d._id === "lang-eng")).toBe(true);
        expect(res2.docs.some((d) => d._id === "user-public")).toBe(false);
    });

    // TODO: Fix this test after researching CouchDB indexing
    it.skip("does not return indexing warnings on getDocsPerGroup queries", async () => {
        const userAccess = new Map<DocType, Uuid[]>();
        userAccess[DocType.Post] = ["group-public-content"];
        userAccess[DocType.Tag] = ["group-public-content"];
        userAccess[DocType.Group] = ["group-public-content"];

        // The first test checks for indexing warnings for queries on the full time range
        const res: DbQueryResult = await service.getDocsPerGroup("user-public", {
            userAccess,
            from: 0,
        });

        // The second test checks for indexing warnings for queries on a specific time range
        // const oldest = await service.getOldestChangeTime();
        const newest = await service.getLatestDocUpdatedTime();
        const res2: DbQueryResult = await service.getDocsPerGroup("user-public", {
            userAccess,
            // from: Math.floor(newest - (newest - oldest) / 2),
            from: newest,
        });

        expect(res.warnings).toBe(undefined);
        expect(res2.warnings).toBe(undefined);
    });

    it("does not return indexing warnings on getGroups queries", async () => {
        const res: DbQueryResult = await service.getGroups();
        expect(res.warnings).toBe(undefined);
    });

    it("emits two 'update' events when a document is added or updated", async () => {
        const doc = {
            _id: "post-post1",
            type: "post",
            memberOf: ["group-public-content"],
            image: "test-data",
            tags: ["tag-category1", "tag-topicA"],
        };

        // check if an update is emitted with the updated document
        const postUpdateHandler = (update: any) => {
            if (update.type === DocType.Post) {
                expect(update._id).toBe("post-post1");
                expect(update.image).toBe("test-data");
                service.off("update", postUpdateHandler);
            }
        };

        // check if an update is emitted with the change document
        const changeUpdateHandler = (update: any) => {
            if (update.type === DocType.Change) {
                expect(update.docId).toBe("post-post1");
                expect(update.change.image).toBe("test-data");
                service.off("update", changeUpdateHandler);
            }
        };

        service.on("update", postUpdateHandler);
        service.on("update", changeUpdateHandler);

        await service.upsertDoc(doc);
    });
});
