import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { IdentityResult } from "./authIdentity.service";
import { accountIdentity, rateLimitIdentity, type AccountIdentity } from "./requestIdentity";
import { ownerKey } from "./ownerKey";

/** Server-resolved request identity, independent of the credential transport. */
export type RequestIdentity = Readonly<{
    authenticated: boolean;
    account?: AccountIdentity;
    ownerKey?: string;
    rateLimitKey: string;
}>;

/** Resolve once after authentication; controllers and storage never interpret token claims. */
export function resolveRequestIdentity(
    identity: IdentityResult,
    ip: string,
    ownerSecret?: string,
): RequestIdentity {
    const authenticated = identity.status === "authenticated" && !identity.userDetails.anonymous;
    const user = authenticated
        ? identity.userDetails
        : { ...identity.userDetails, anonymous: true as const };
    const account = accountIdentity(user);
    return Object.freeze({
        authenticated,
        account: account ? Object.freeze(account) : undefined,
        ownerKey: account && ownerSecret ? ownerKey(user, ownerSecret) : undefined,
        rateLimitKey: rateLimitIdentity(user, ip),
    });
}

/** Only an authenticated account with a configured owner key may access user data. */
export function requireUserDataOwner(identity: RequestIdentity | undefined): string {
    if (!identity?.authenticated || !identity.account)
        throw new UnauthorizedException("Authentication required for user data");
    if (!identity.ownerKey) throw new ServiceUnavailableException("User-data source is disabled");
    return identity.ownerKey;
}
