import { accountIdentity, rateLimitIdentity } from "./requestIdentity";
import type { JwtUserDetails } from "./authIdentity.service";

const user: JwtUserDetails = {
    groups: [],
    jwtPayload: { iss: "https://issuer.example", sub: "subject-123" },
};

describe("authenticated account identity", () => {
    it("preserves the verified issuer and subject exactly", () => {
        expect(accountIdentity(user)).toEqual({
            issuer: "https://issuer.example",
            subject: "subject-123",
        });
        expect(
            accountIdentity({
                ...user,
                jwtPayload: { iss: "https://issuer.example/", sub: "Subject-123" },
            }),
        ).toEqual({ issuer: "https://issuer.example/", subject: "Subject-123" });
    });

    it.each([
        undefined,
        { groups: [] },
        { ...user, anonymous: true },
        { ...user, jwtPayload: { sub: "missing-issuer" } },
        { ...user, jwtPayload: { iss: "https://issuer.example" } },
        { ...user, jwtPayload: { iss: "", sub: "subject" } },
        { ...user, jwtPayload: { iss: "https://issuer.example", sub: "" } },
        { ...user, jwtPayload: { iss: 123, sub: "subject" } },
        { ...user, jwtPayload: { iss: "https://issuer.example", sub: 123 } },
    ])(
        "does not manufacture an account from an incomplete or anonymous identity: %j",
        (identity) => {
            expect(accountIdentity(identity as JwtUserDetails)).toBeUndefined();
        },
    );
});

describe("rate-limit identity", () => {
    it("preserves the existing shared User id bucket", () => {
        expect(rateLimitIdentity({ ...user, userId: "user-existing" }, "127.0.0.1")).toBe(
            "user-existing",
        );
        expect(rateLimitIdentity({ groups: [], userId: "user-existing" }, "192.0.2.1")).toBe(
            "user-existing",
        );
    });

    it("separates accounts behind the same IP without a shared User document", () => {
        const original = rateLimitIdentity(user, "127.0.0.1");
        expect(original).toMatch(/^jwt:[a-f0-9]{64}$/);
        expect(
            rateLimitIdentity(
                { ...user, jwtPayload: { ...user.jwtPayload, sub: "other" } },
                "127.0.0.1",
            ),
        ).not.toBe(original);
        expect(
            rateLimitIdentity(
                { ...user, jwtPayload: { ...user.jwtPayload, iss: "https://other.example" } },
                "127.0.0.1",
            ),
        ).not.toBe(original);
    });

    it("keeps the account allowance across token refreshes, sessions and IP changes", () => {
        const refreshed: JwtUserDetails = {
            ...user,
            groups: ["new-group"],
            email: "changed@example.com",
            jwtPayload: {
                ...user.jwtPayload,
                iat: 200,
                exp: 300,
                jti: "new-token-id",
                sid: "new-session-id",
            },
        };
        expect(rateLimitIdentity(refreshed, "192.0.2.1")).toBe(
            rateLimitIdentity(user, "127.0.0.1"),
        );
    });

    it("uses IP for anonymous identities even when other identity fields are present", () => {
        expect(
            rateLimitIdentity({ ...user, userId: "untrusted", anonymous: true }, "127.0.0.1"),
        ).toBe("ip:127.0.0.1");
        expect(rateLimitIdentity(undefined, "127.0.0.1")).toBe("ip:127.0.0.1");
        expect(rateLimitIdentity({ groups: [] }, "192.0.2.1")).toBe("ip:192.0.2.1");
    });
});
