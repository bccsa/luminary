import { createHash } from "crypto";
import type { JwtUserDetails } from "./authIdentity.service";

export type AccountIdentity = Readonly<{ issuer: string; subject: string }>;

/** Accept only the identity supplied by authentication, never a client request body. */
export function accountIdentity(user: JwtUserDetails | undefined): AccountIdentity | undefined {
    const payload = user?.jwtPayload;
    if (
        user?.anonymous ||
        typeof payload?.iss !== "string" ||
        !payload.iss ||
        typeof payload?.sub !== "string" ||
        !payload.sub
    )
        return undefined;
    return { issuer: payload.iss, subject: payload.sub };
}

/** Token refreshes and separate sessions of one account share the same allowance. */
export function rateLimitIdentity(user: JwtUserDetails | undefined, ip: string): string {
    if (user?.anonymous) return `ip:${ip}`;
    if (user?.userId) return user.userId;
    const account = accountIdentity(user);
    if (!account) return `ip:${ip}`;
    // JSON framing avoids ambiguous claim boundaries in this non-persistent hash.
    return `jwt:${createHash("sha256")
        .update(JSON.stringify([account.issuer, account.subject]))
        .digest("hex")}`;
}
