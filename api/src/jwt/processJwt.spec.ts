import { INestApplication } from "@nestjs/common";
import { processJwt, parseJwtMap, clearJwtMap } from "./processJwt";
import { createTestingModule } from "../test/testingModule";
import { DbService } from "../db/db.service";
import configuration from "../configuration";
import { UserDto } from "src/dto/UserDto";

describe("processJwt", () => {
    let db: DbService;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule, dbService } = await createTestingModule("process-jwt");
        db = dbService;
        return testingModule.createNestApplication();
    }

    beforeAll(async () => {
        await createNestApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
        clearJwtMap();
    });

    it("can parse a jwt map", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "groups": {
                        "group-super-admins": "() => true"
                    },
                    "userId": "() => '12345678'",
                    "email": "() => 'editor1@users.test'",
                    "name": "() => 'Test User'"
                }`,
            },
        });

        const parsed = parseJwtMap(configuration().auth.jwtMappings);

        expect(parsed["groups"]["group-super-admins"]("any jwt data")).toBe(true);
    });

    it("can process a JWT token and return mapped groups and extracted user details", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "groups": {
                        "group-super-admins": "() => true"
                    },
                    "userId": "() => 'editor1'",
                    "email": "() => 'editor1@users.test'",
                    "name": "() => 'Test User'"
                }`,
            },
        });

        // await createNestApp("process-jwt" + i);
        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-super-admins");
        expect(evaluated.userId).toBe("editor1"); // included in the JWT_MAPPINGS
        expect(evaluated.email).toBe("editor1@users.test");
        expect(evaluated.name).toBe("Test User");
    });

    it("can identify a user by email", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "email": "() => 'editor1@users.test'"
                }`,
            },
        });

        // await createNestApp("process-jwt" + i);
        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors"); // included in the database user document
        expect(evaluated.groups).toContain("group-private-editors"); // included in the database user document
    });

    it("can identify a user by external id", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "userId": "() => 'editor1'",
                    "email": "() => 'non-valid-email'"
                }`,
            },
        });

        // It should prefer the userId mapping over the email mapping
        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors"); // included in the database user document
        expect(evaluated.groups).toContain("group-private-editors"); // included in the database user document
    });

    it("can update the user name and email in the database from mapped JWT data", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "userId": "() => 'editor1'",
                    "email": "() => 'updated@email.address'",
                    "name": "() => 'Updated User Name'"
                }`,
            },
        });

        await processJwt("any jwt data", db);

        const res = await db.getUserByIdOrEmail("updated@email.address", "editor1");
        const userDocs = res.docs as UserDto[];

        expect(userDocs.length).toBe(1); // We have not yet added another user with the same email address
        expect(userDocs[0].name).toBe("Updated User Name");
        expect(userDocs[0].email).toBe("updated@email.address");
    });

    it("can concatenate user groups from multiple user documents with matching email addresses and userIds", async () => {
        const actual = jest.requireActual("../configuration");
        jest.spyOn(actual, "default").mockReturnValue({
            auth: {
                jwtMappings: `{
                    "userId": "() => 'testUser1'",
                    "email": "() => 'test@email.1'"
                }`,
            },
        });

        // Create two users with the same email. Only one of them has an ID set. The two users have different groups.
        await db.upsertDoc({
            _id: "testUser1",
            type: "user",
            userId: "testUser1",
            email: "test@email.1",
            name: "Test User 1",
            memberOf: ["group-public-editors"],
        } as UserDto);

        await db.upsertDoc({
            _id: "testUser2",
            type: "user",
            userId: "",
            email: "test@email.1",
            name: "Test User 2",
            memberOf: ["group-private-editors", "group-public-editors"],
        } as UserDto);

        // It should prefer the userId mapping over the email mapping
        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
        expect(evaluated.groups.length).toBe(2);
    });
});
