import { INestApplication } from "@nestjs/common";
import { processJwt, clearGroupNameCache } from "./processJwt";
import * as verifyJwt from "./verifyJwt";
import { createTestingModule } from "../test/testingModule";
import { DbService } from "../db/db.service";
import { UserDto } from "src/dto/UserDto";
import type { TrustedProviderShape } from "./verifyJwt";
import type { JwtPayload } from "jsonwebtoken";

jest.mock("./verifyJwt", () => ({
    verifyJwtAndMatchProvider: jest.fn(),
    clearJwksClients: jest.fn(),
}));

function mockVerified(
    jwtPayload: JwtPayload,
    matchedProvider: TrustedProviderShape,
) {
    (verifyJwt.verifyJwtAndMatchProvider as jest.Mock).mockResolvedValue({
        jwtPayload,
        matchedProvider,
    });
}

describe("processJwt", () => {
    let db: DbService;

    async function createNestApp(): Promise<INestApplication> {
        const { testingModule, dbService } =
            await createTestingModule("process-jwt");
        db = dbService;
        return testingModule.createNestApplication();
    }

    beforeAll(async () => {
        await createNestApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
        clearGroupNameCache();
        (verifyJwt.clearJwksClients as jest.Mock).mockClear();
    });

    it("can process a JWT token and return mapped groups and extracted user details", async () => {
        mockVerified(
            {
                sub: "editor1",
                email: "editor1@users.test",
                name: "Test User",
            } as JwtPayload,
            {
                groupAssignments: [
                    {
                        groupId: "group-super-admins",
                        conditions: [{ type: "always" as const }],
                    },
                ],
            },
        );

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-super-admins");
        expect(evaluated.userId).toBe("editor1");
        expect(evaluated.email).toBe("editor1@users.test");
        expect(evaluated.name).toBe("Test User");
    });

    it("can identify a user by email", async () => {
        mockVerified({ email: "editor1@users.test" } as JwtPayload, {});

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
    });

    it("can identify a user by external id", async () => {
        mockVerified(
            { sub: "editor1", email: "non-valid-email" } as JwtPayload,
            {},
        );

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
    });

    it("can update the user name and email in the database from mapped JWT data", async () => {
        mockVerified(
            {
                sub: "editor1",
                email: "updated@email.address",
                name: "Updated User Name",
            } as JwtPayload,
            {},
        );

        await processJwt("any jwt data", db);

        const res = await db.getUserByIdOrEmail(
            "updated@email.address",
            "editor1",
        );
        const userDocs = res.docs as UserDto[];

        expect(userDocs.length).toBe(1);
        expect(userDocs[0].name).toBe("Updated User Name");
        expect(userDocs[0].email).toBe("updated@email.address");
    });

    it("can concatenate user groups from multiple user documents with matching email addresses and userIds", async () => {
        mockVerified(
            { sub: "testUser1", email: "test@email.1" } as JwtPayload,
            {},
        );

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

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
        expect(evaluated.groups).toContain("group-public-users");
        expect(evaluated.groups.length).toBe(3);
    });

    it("still returns DB groups when JWT verification fails (expired token)", async () => {
        // Simulate verifyJwtAndMatchProvider returning an unverified payload
        // (matchedProvider is undefined because JWKS verification failed)
        (verifyJwt.verifyJwtAndMatchProvider as jest.Mock).mockResolvedValue({
            jwtPayload: { sub: "editor1", email: "editor1@users.test" },
            matchedProvider: undefined,
            verified: false,
        });

        const evaluated = await processJwt("expired-jwt", db);

        // Should still have DB groups from the user document
        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
        expect(evaluated.groups).toContain("group-public-users");
        // Should NOT have provider-assigned groups (no verified provider)
        expect(evaluated.groups).not.toContain("group-super-admins");
    });
});
