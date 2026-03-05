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

    it("can map a single-string JWT claim value to a group (not just arrays)", async () => {
        mockVerified(
            {
                sub: "editor1",
                email: "editor1@users.test",
                role: "Editors Public", // single string, not an array
            } as JwtPayload,
            {
                claimMappings: [{ claim: "role", target: "groups" }],
            },
        );

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
    });

    it("can map an array JWT claim value to groups via claimMappings", async () => {
        mockVerified(
            {
                sub: "editor1",
                email: "editor1@users.test",
                roles: ["Editors Public", "Editors Private"],
            } as JwtPayload,
            {
                claimMappings: [{ claim: "roles", target: "groups" }],
            },
        );

        const evaluated = await processJwt("any jwt data", db);

        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
    });

    it("uses raw JWT claims (sub/email) for DB lookup even when userFieldMappings overrides them", async () => {
        // Simulate a provider with claimNamespace and userFieldMappings that extracts
        // different values from the namespace — the DB lookup should still find the user
        // via jwtPayload.sub and jwtPayload.email (raw claims).
        mockVerified(
            {
                sub: "editor1",
                email: "editor1@users.test",
                "https://myapp.com/claims": {
                    // namespace has different email than top-level
                    customEmail: "wrong@namespace.value",
                },
            } as unknown as JwtPayload,
            {
                claimNamespace: "https://myapp.com/claims",
                userFieldMappings: { email: "customEmail" },
            },
        );

        const evaluated = await processJwt("any jwt data", db);

        // DB user was found via raw jwtPayload.email ("editor1@users.test"), not
        // the namespace value ("wrong@namespace.value")
        expect(evaluated.groups).toContain("group-public-editors");
        expect(evaluated.groups).toContain("group-private-editors");
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
