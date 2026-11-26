import { JwtUserDetails } from "../auth/authIdentity.service";
import { AuthProviderDto } from "../dto/AuthProviderDto";
import { AclPermission } from "../enums";
import { AccessMap } from "../permissions/permissions.service";
import { issuer } from "../util/authority";
import configuration from "../configuration";
import { McpProviderSettings } from "./mcpProviderConfig";

/** Shown when an authenticated user has no McpView anywhere. */
export const NO_MCP_ACCESS_MESSAGE =
    "Your account has no MCP access (McpView). Ask a Luminary admin to grant it.";

/**
 * RFC 9728 metadata URL for a resource: the well-known path is inserted between the origin and
 * the resource's path.
 */
export function protectedResourceMetadataUrl(resourceUrl: string): string {
    const url = new URL(resourceUrl);
    return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
}

/** RFC 9728 Protected Resource Metadata pointing MCP clients at the provider's issuer. */
export function protectedResourceMetadata(
    provider: AuthProviderDto,
    settings: McpProviderSettings,
): Record<string, unknown> {
    const allowInsecure = configuration().auth?.allowInsecureProviderDomain === true;
    return {
        resource: settings.resourceUrl,
        authorization_servers: [issuer(provider.domain, allowInsecure)],
        bearer_methods_supported: ["header"],
        resource_name: `Luminary (${provider.label || provider.displayName || provider.domain})`,
    };
}

/** `WWW-Authenticate` challenge for a 401; `invalidToken` marks a token that was presented and rejected. */
export function bearerChallenge(resourceUrl: string, invalidToken = false): string {
    const metadata = `resource_metadata="${protectedResourceMetadataUrl(resourceUrl)}"`;
    return invalidToken ? `Bearer error="invalid_token", ${metadata}` : `Bearer ${metadata}`;
}

/** True when the user holds McpView on any doc type in any group: the MCP entry gate. */
export function hasMcpAccess(accessMap: AccessMap | undefined): boolean {
    if (!accessMap) return false;
    // The AccessMap is a plain object at runtime (see PermissionSystem.getAccessMap).
    return Object.values(accessMap as unknown as Record<string, Record<string, any>>).some(
        (byType) =>
            Object.values(byType ?? {}).some((perms) => perms?.[AclPermission.McpView] === true),
    );
}

/**
 * Rate-limit identity for an MCP caller. Built only from the verified identity: the User doc id,
 * or the provider plus the token's verified `sub`. Undefined when neither exists.
 */
export function mcpRateLimitKey(user: JwtUserDetails, providerId: string): string | undefined {
    if (user.userId) return user.userId;
    const sub = user.jwtPayload?.sub;
    return sub ? `${providerId}:${sub}` : undefined;
}
