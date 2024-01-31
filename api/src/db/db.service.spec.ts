import { Test, TestingModule } from "@nestjs/testing";
import { DbService } from "./db.service";
import { randomUUID } from "crypto";
import { upsertDesignDocs, upsertSeedingDocs } from "./db.seedingFunctions";

describe("DbService", () => {
    let service: DbService;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile();

        service = module.get<DbService>(DbService);

        // Seed database with required views and some default documents (needed for testing views)
        await upsertDesignDocs();
        await upsertSeedingDocs();
    });

    it("can be instantiated", () => {
        expect(service).toBeDefined();
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

    it("can update get the latest document updated time", async () => {
        const res: number = await service.getLatestUpdatedTime();

        expect(res).toBe(3);
    });

    it("can update get the oldest changelogEntry document updated time", async () => {
        const res: number = await service.getOldestChangelogEntryUpdatedTime();

        expect(res).toBe(1);
    });

    it("can retreive user's own document", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: [],
            types: [],
            from: 0,
        });

        expect(res.docs[0]._id).toBe("user-public");
        expect(res.docs.length).toBe(1);
    });

    it("can retreive documents using one group selector", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: ["group-public-content"],
            types: ["post", "tag"],
            from: 0,
        });

        expect(res.docs.length).toBe(4);
    });

    it("can retreive documents using two group selectors", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: ["group-public-content", "group-private-content"],
            types: ["post", "tag"],
            from: 0,
        });

        expect(res.docs.length).toBe(7);
    });

    it("can retreive documents of one type", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: ["group-public-content"],
            types: ["post"],
            from: 0,
        });

        expect(res.docs.length).toBe(2); // result always includes the user's own user document
    });

    it("can retreive documents of two types", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: ["group-public-content"],
            types: ["post", "tag"],
            from: 0,
        });

        expect(res.docs.length).toBe(4); // result always includes the user's own user document
    });

    it("can retreive documents from a given time", async () => {
        const res: any = await service.getDocs("user-public", {
            groups: ["group-public-content"],
            types: ["post", "tag"],
            from: 2,
        });

        expect(res.docs.length).toBe(3);
    });
});
