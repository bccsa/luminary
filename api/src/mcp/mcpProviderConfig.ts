import { AuthProviderDto } from "../dto/AuthProviderDto";

/** The MCP settings of an AuthProvider that has MCP enabled with a valid config. */
export type McpProviderSettings = {
    /** Canonical MCP URL: the resource clients request tokens for, and the expected `aud`. */
    resourceUrl: string;
    /** When non-empty, the token's `azp`/`client_id` must be one of these. */
    allowedClientIds: string[];
    /** CMS base URL for links in tool results. */
    cmsUrl?: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(value: unknown): URL | undefined {
    if (typeof value !== "string" || !value) return undefined;
    try {
        return new URL(value);
    } catch {
        return undefined;
    }
}

function isSecure(url: URL): boolean {
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
}

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

/**
 * Why a provider's `mcp` config can't be used, or undefined when it is valid or MCP is off.
 * Enforced on save and again before serving, so a bad config fails closed.
 */
export function mcpProviderConfigError(provider: AuthProviderDto): string | undefined {
    const mcp = provider.mcp;
    if (!mcp?.enabled) return undefined;

    const resource = parseUrl(mcp.resourceUrl);
    if (!resource) return "mcp.resourceUrl must be an absolute URL";
    if (!isSecure(resource))
        return "mcp.resourceUrl must use https (http is only allowed for localhost)";
    if (resource.search || resource.hash)
        return "mcp.resourceUrl must not contain a query or fragment";
    // Tokens are matched against this exact string, so it must already be canonical.
    if (resource.href !== mcp.resourceUrl)
        return `mcp.resourceUrl must be in canonical form: ${resource.href}`;
    if (!resource.pathname.endsWith(`/mcp/${provider._id}`))
        return `mcp.resourceUrl must end with /mcp/${provider._id}`;
    // With the CMS client pin off at /mcp, a shared audience would make every CMS token valid there.
    if (withoutTrailingSlash(mcp.resourceUrl) === withoutTrailingSlash(provider.audience ?? ""))
        return "mcp.resourceUrl must differ from the provider's audience";

    if (mcp.cmsUrl !== undefined && mcp.cmsUrl !== "") {
        const cms = parseUrl(mcp.cmsUrl);
        if (!cms || !isSecure(cms)) return "mcp.cmsUrl must be an absolute https URL";
    }
    return undefined;
}

/** The provider's MCP settings when MCP is enabled and the config is valid; otherwise undefined. */
export function mcpSettings(
    provider: AuthProviderDto | undefined,
): McpProviderSettings | undefined {
    if (!provider?.mcp?.enabled || mcpProviderConfigError(provider)) return undefined;
    return {
        resourceUrl: provider.mcp.resourceUrl,
        allowedClientIds: provider.mcp.allowedClientIds ?? [],
        cmsUrl: provider.mcp.cmsUrl ? withoutTrailingSlash(provider.mcp.cmsUrl) : undefined,
    };
}
