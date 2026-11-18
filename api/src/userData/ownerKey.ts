import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac } from "crypto";
import { JwtUserDetails } from "../auth/authIdentity.service";

function identityClaims(user: JwtUserDetails): { iss: string; sub: string } | undefined {
    const payload = user?.jwtPayload;
    if (
        user?.anonymous ||
        typeof payload?.iss !== "string" ||
        !payload.iss ||
        typeof payload?.sub !== "string" ||
        !payload.sub
    )
        return undefined;
    return { iss: payload.iss, sub: payload.sub };
}

/** All owner-scoped paths authorize here; future device authorization belongs here too. */
export function ownerKey(user: JwtUserDetails, secret: string): string {
    const claims = identityClaims(user);
    if (!claims) throw new UnauthorizedException("Authentication required for user data");
    if (!secret) throw new ServiceUnavailableException("User-data source is disabled");
    return createHmac("sha256", secret).update(`${claims.iss}\n${claims.sub}`).digest("hex");
}

/** Stable limiter identity even for authenticated users without a shared User document. */
export function changeRequestIdentity(user: JwtUserDetails, ip: string): string {
    if (user?.userId) return user.userId;
    const claims = identityClaims(user);
    if (!claims) return `ip:${ip}`;
    // JSON framing avoids ambiguous claim boundaries in this non-persistent hash.
    return `jwt:${createHash("sha256")
        .update(JSON.stringify([claims.iss, claims.sub]))
        .digest("hex")}`;
}
