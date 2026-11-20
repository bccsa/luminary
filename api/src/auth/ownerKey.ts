import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHmac } from "crypto";
import type { JwtUserDetails } from "./authIdentity.service";
import { accountIdentity } from "./requestIdentity";

/** All owner-scoped paths authorize here; future device authorization belongs here too. */
export function ownerKey(user: JwtUserDetails, secret: string): string {
    const account = accountIdentity(user);
    if (!account) throw new UnauthorizedException("Authentication required for user data");
    if (!secret) throw new ServiceUnavailableException("User-data source is disabled");
    return createHmac("sha256", secret)
        .update(`${account.issuer}\n${account.subject}`)
        .digest("hex");
}
