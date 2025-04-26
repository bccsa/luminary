import { processJwt, parseJwtMap } from "./processJwt";

describe("processJwt", () => {
    const oldEnv = process.env;
    beforeAll(() => {
        process.env = { ...oldEnv }; // Make a copy of the old environment variables

        process.env.JWT_MAPPINGS = `{
            "groups": {
                "group-super-admins": "() => true"
            },
            "userId": "() => 'user-super-admin'",
            "email": "() => 'test@123.com'",
            "name": "() => 'Test User'"
        }`;
    });

    afterAll(() => {
        process.env = oldEnv;
    });

    it("can parse a jwt map", async () => {
        const parsed = parseJwtMap(process.env.JWT_MAPPINGS);

        expect(parsed["groups"]["group-super-admins"]("any jwt data")).toBe(true);
    });

    it("can process a JWT token and return mapped groups and extracted user details", async () => {
        const evaluated = processJwt("any jwt data");

        expect(evaluated.groups).toContain("group-super-admins");
        expect(evaluated.userId).toBe("user-super-admin");
        expect(evaluated.email).toBe("test@123.com");
        expect(evaluated.name).toBe("Test User");
    });
});
