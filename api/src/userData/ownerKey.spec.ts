import { UnauthorizedException } from "@nestjs/common";
import { ownerKey, changeRequestIdentity } from "./ownerKey";
import { JwtUserDetails } from "../auth/authIdentity.service";

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

    it("keys limiter buckets by User id, then verified identity, then IP", () => {
        expect(changeRequestIdentity({ ...user, userId: "user-existing" }, "127.0.0.1")).toBe(
            "user-existing",
        );
        const identity = changeRequestIdentity(user, "127.0.0.1");
        expect(identity).toMatch(/^jwt:[a-f0-9]{64}$/);
        expect(changeRequestIdentity(user, "192.0.2.1")).toBe(identity);
        expect(
            changeRequestIdentity(
                { ...user, jwtPayload: { ...user.jwtPayload, sub: "other" } },
                "127.0.0.1",
            ),
        ).not.toBe(identity);
        expect(changeRequestIdentity({ groups: [], anonymous: true }, "127.0.0.1")).toBe(
            "ip:127.0.0.1",
        );
    });
});
