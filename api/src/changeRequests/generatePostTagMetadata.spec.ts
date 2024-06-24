import "reflect-metadata";
import { DbService } from "../db/db.service";
import { createTestingModule } from "../test/testingModule";
import { PermissionSystem } from "../permissions/permissions.service";
import { generatePostTagMetadata } from "./generatePostTagMetadata";
import { Logger } from "winston";

describe("generatePostTagMetadata", () => {
    let db: DbService;
    const logger = new Logger();

    beforeAll(async () => {
        const testingModule = await createTestingModule("generate-post-tag-metadata");
        db = testingModule.dbService;
        PermissionSystem.upsertGroups((await db.getGroups()).docs);
    });

    it("is generating metadata for a post document", async () => {
        const res = await generatePostTagMetadata(db, logger, "post-post1");

        expect(res).toBeInstanceOf(Array);
        expect(res.length).toBe(2);
        expect(res[0].contentId).toBe("content-post1-eng");
        expect(res[0].languageId).toBe("lang-eng");
        expect(res[0].title).toBe("Post 1");
        expect(res[0].status).toBe("published");
        expect(res[0].publishDate).toBeGreaterThan(0); // set in the test data
        expect(res[0].expiryDate).toBeUndefined(); // not set in the test data
    });
});
