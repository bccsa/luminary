import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { IdentityResult, JwtUserDetails } from "./authIdentity.service";
import { requireUserDataOwner, resolveRequestIdentity } from "./requestContext";

const user: JwtUserDetails = {
    groups: [],
    jwtPayload: { iss: "https://issuer.example", sub: "subject-123" },
};
const authenticated = (details: JwtUserDetails = user): IdentityResult => ({
    status: "authenticated",
    userDetails: details,
});

describe("auth-resolved request identity", () => {
    it("preserves the existing stored owner partition for an account without a shared User", () => {
        const identity = resolveRequestIdentity(authenticated(), "127.0.0.1", "test-owner-secret");
        expect(requireUserDataOwner(identity)).toBe(
            "71d174dbb77b6a56bf48a587931f8dd270eab8e7821fd44d3b8096e3d5ade0ec",
        );
        expect(identity.rateLimitKey).toMatch(/^jwt:[a-f0-9]{64}$/);
    });

    it("keeps owner and allowance across token refreshes, sessions, and IP changes", () => {
        const first = resolveRequestIdentity(authenticated(), "127.0.0.1", "secret");
        const next = resolveRequestIdentity(
            authenticated({
                ...user,
                jwtPayload: { ...user.jwtPayload, jti: "new-token", sid: "new-session", exp: 999 },
            }),
            "192.0.2.1",
            "secret",
        );
        expect(next.ownerKey).toBe(first.ownerKey);
        expect(next.rateLimitKey).toBe(first.rateLimitKey);
    });

    it("isolates accounts behind the same IP", () => {
        const first = resolveRequestIdentity(authenticated(), "127.0.0.1", "secret");
        for (const jwtPayload of [
            { iss: "https://other.example", sub: "subject-123" },
            { iss: "https://issuer.example", sub: "other-subject" },
        ]) {
            const other = resolveRequestIdentity(
                authenticated({ ...user, jwtPayload }),
                "127.0.0.1",
                "secret",
            );
            expect(other.ownerKey).not.toBe(first.ownerKey);
            expect(other.rateLimitKey).not.toBe(first.rateLimitKey);
        }
    });

    it("uses the auth result's anonymous status even if details contain account claims", () => {
        const identity = resolveRequestIdentity(
            { status: "anonymous", userDetails: { ...user, userId: "untrusted" } },
            "127.0.0.1",
            "secret",
        );
        expect(identity.authenticated).toBe(false);
        expect(identity.rateLimitKey).toBe("ip:127.0.0.1");
        expect(identity.ownerKey).toBeUndefined();
        expect(() => requireUserDataOwner(identity)).toThrow(UnauthorizedException);
    });

    it("keeps shared requests available when user-data configuration is absent", () => {
        const identity = resolveRequestIdentity(
            authenticated({ ...user, userId: "shared-user" }),
            "127.0.0.1",
        );
        expect(identity.rateLimitKey).toBe("shared-user");
        expect(identity.authenticated).toBe(true);
        expect(() => requireUserDataOwner(identity)).toThrow(ServiceUnavailableException);
    });

    it("rejects user-data access without a complete authenticated account", () => {
        for (const details of [{ groups: [] }, { ...user, anonymous: true as const }]) {
            expect(() =>
                requireUserDataOwner(
                    resolveRequestIdentity(authenticated(details), "127.0.0.1", "secret"),
                ),
            ).toThrow(UnauthorizedException);
        }
        expect(() => requireUserDataOwner(undefined)).toThrow(UnauthorizedException);
    });

    it("freezes resolved identity so later claim changes cannot select another owner or allowance", () => {
        const details = { ...user, jwtPayload: { ...user.jwtPayload } };
        const identity = resolveRequestIdentity(authenticated(details), "127.0.0.1", "secret");
        const owner = requireUserDataOwner(identity);
        const allowance = identity.rateLimitKey;
        details.jwtPayload.sub = "another-account";
        expect(requireUserDataOwner(identity)).toBe(owner);
        expect(identity.rateLimitKey).toBe(allowance);
        expect(Object.isFrozen(identity)).toBe(true);
        expect(Object.isFrozen(identity.account)).toBe(true);
    });
});
