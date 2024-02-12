import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "./db.service";
import { randomUUID } from "crypto";

describe("DbService", () => {
    let service: DbService;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile();

        service = module.get<DbService>(DbService);
    });

    it("can be instantiated", () => {
        expect(service).toBeDefined();
    });

    it("can read a single existing document", async () => {
        const doc: any = await service.getDoc("user-public");

        expect(doc._id).toBe("user-public");
    });

    it("can handle exceptions on reading non-exising documents", async () => {
        const res: any = await service.getDoc("non-existing-document");

        expect(res).toBe(undefined);
    });

    it("can insert a new document", async () => {
        const uuid = randomUUID();
        const doc = {
            _id: uuid,
            testData: "test123",
        };

        await service.upsertDoc(doc);

        const testGet = (await service.getDoc(uuid)) as any;

        expect(testGet._id).toBe(uuid);
        expect(testGet.testData).toBe("test123");
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

        expect(testGet._id).toBe(uuid);
        expect(testGet.testData).toBe("changedData123");
    });

    it("can get the latest document updated time", async () => {
        // Add / update a document and check if the latest document update time is close to now.
        const newDoc = {
            _id: "docUpdateTimeTest",
            testData: "newData123",
        };
        await service.upsertDoc(newDoc);

        const res: number = await service.getLatestDocUpdatedTime();

        expect(res).toBeGreaterThan(Date.now() - 100);
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
        const res: any = await service.getDocs("user-public", {
            groups: [],
            types: [],
            from: 0,
        });

        expect(res.docs[0]._id).toBe("user-public");
        expect(res.docs.length).toBe(1);
    });

    it("can retrieve documents using one group selector", async () => {
        const res: any = await service.getDocs("", {
            groups: ["group-public-content"],
            types: ["post", "tag"],
            from: 0,
        });

        const docCount = res.docs.filter((t) => t.memberOf.includes("group-public-content")).length;
        expect(docCount).toBe(3);
    });

    it("can retrieve documents using two group selectors", async () => {
        const res: any = await service.getDocs("", {
            groups: ["group-public-content", "group-private-content"],
            types: ["post", "tag"],
            from: 0,
        });

        const docCount =
            res.docs.filter((t) => t.memberOf.includes("group-public-content")).length +
            res.docs.filter((t) => t.memberOf.includes("group-private-content")).length;
        expect(docCount).toBe(6);
    });

    it("can retrieve documents of one type", async () => {
        const res: any = await service.getDocs("", {
            groups: ["group-public-content"],
            types: ["post"],
            from: 0,
        });

        const docCount = res.docs.filter((t) => t.type === "post").length;
        expect(docCount).toBe(1);
    });

    it("can retrieve documents of two types", async () => {
        const res: any = await service.getDocs("", {
            groups: ["group-public-content"],
            types: ["post", "tag"],
            from: 0,
        });

        const docCount =
            res.docs.filter((t) => t.type === "post").length +
            res.docs.filter((t) => t.type === "tag").length;
        expect(docCount).toBe(3);
    });

    it("can retrieve documents from a given time", async () => {
        // Update a document and query documents from a timestamp just before the updated time.
        // Only one document should be returned (which is newer than the update time)
        const doc = {
            _id: "content-post1-eng",
            type: "content",
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

        const res: any = await service.getDocs("", {
            groups: ["group-public-content"],
            types: ["post", "tag", "content"],
            from: Date.now() - 100,
        });

        expect(res.docs.length).toBe(1);
    });

    it("can retrieve the group itself from the passed groups query property", async () => {
        const res: any = await service.getDocs("", {
            groups: ["group-public-content"],
            types: ["group"],
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
        const res: any = await service.upsertDoc({
            _id: "group-private-content",
            type: "group",
            updatedTimeUtc: 3,
            name: "Private Content",
            acl: [
                {
                    type: "post",
                    groupId: "group-private-users",
                    permission: ["view"],
                },
                {
                    type: "tag",
                    groupId: "group-private-users",
                    permission: ["view"],
                },
                {
                    type: "post",
                    groupId: "group-private-editors",
                    permission: ["view", "edit", "translate", "publish"],
                },
                {
                    type: "tag",
                    groupId: "group-private-editors",
                    permission: ["view", "translate", "assign"],
                },
                {
                    type: "group",
                    groupId: "group-private-editors",
                    permission: ["view", "assign"],
                },
            ],
        });
        expect(res).toBe("passed document equal to existing database document");
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
    });

    // TODO: Enable after adding Mango Indexes
    // it("does not return database warnings", async () => {
    //     const res: any = await service.getDocs("", {
    //         groups: [""],
    //         types: [""],
    //         from: 0,
    //     });

    //     console.log(res);
    //     expect(res.warning).toBe(undefined);
    // });
});
