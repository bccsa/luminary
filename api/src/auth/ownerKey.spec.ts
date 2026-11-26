import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ownerKey } from "./ownerKey";
import type { JwtUserDetails } from "./authIdentity.service";

const user: JwtUserDetails = {
    groups: [],
    jwtPayload: { iss: "https://issuer.example", sub: "subject-123" },
};

describe("user-data owner identity", () => {
    it("matches the persistent HMAC identity without requiring a User document", () => {
        expect(ownerKey(user, "test-owner-secret")).toBe(
            "71d174dbb77b6a56bf48a587931f8dd270eab8e7821fd44d3b8096e3d5ade0ec",
        );
    });

    it("ignores email, shared User id and group membership", () => {
        expect(
            ownerKey(
                {
                    ...user,
                    email: "changed@example.com",
                    userId: "another-user",
                    groups: ["admins"],
                },
                "secret",
            ),
        ).toBe(ownerKey(user, "secret"));
    });

    it("separates issuers, subjects and identity secrets", () => {
        const original = ownerKey(user, "secret");
        expect(
            ownerKey(
                { ...user, jwtPayload: { ...user.jwtPayload, iss: "https://other.example" } },
                "secret",
            ),
        ).not.toBe(original);
        expect(
            ownerKey({ ...user, jwtPayload: { ...user.jwtPayload, sub: "another" } }, "secret"),
        ).not.toBe(original);
        expect(ownerKey(user, "other-secret")).not.toBe(original);
    });

    it.each([
        undefined,
        { groups: [] },
        { ...user, anonymous: true },
        { ...user, jwtPayload: { sub: "missing-issuer" } },
    ])("rejects anonymous or incomplete verified identities", (identity) => {
        expect(() => ownerKey(identity as JwtUserDetails, "secret")).toThrow(UnauthorizedException);
    });

    it("keeps the stored partition when token or session claims rotate", () => {
        expect(
            ownerKey(
                {
                    ...user,
                    jwtPayload: {
                        ...user.jwtPayload,
                        iat: 200,
                        exp: 300,
                        jti: "new-token-id",
                        sid: "new-session-id",
                    },
                },
                "secret",
            ),
        ).toBe(ownerKey(user, "secret"));
    });

    it("rejects a missing owner secret without falling back to another identity", () => {
        expect(() => ownerKey(user, "")).toThrow(ServiceUnavailableException);
        expect(() => ownerKey(user, undefined)).toThrow(ServiceUnavailableException);
        expect(() => ownerKey({ groups: [], anonymous: true }, "")).toThrow(UnauthorizedException);
    });
});
