import { AuthProviderDto } from "../dto/AuthProviderDto";
import { AclPermission, DocType } from "../enums";
import {
    bearerChallenge,
    hasMcpAccess,
    mcpRateLimitKey,
    protectedResourceMetadata,
    protectedResourceMetadataUrl,
} from "./mcpAuth";
import { mcpProviderConfigError, mcpSettings } from "./mcpProviderConfig";

const provider = (mcp?: Partial<AuthProviderDto["mcp"]>) =>
    ({
        _id: "prov-1",
        type: DocType.AuthProvider,
        domain: "tenant.example.auth0.com",
        audience: "https://api.example.org",
        clientId: "cms-client",
        label: "Staff",
        mcp: mcp ? { enabled: true, ...mcp } : undefined,
    }) as AuthProviderDto;

describe("mcpProviderConfigError", () => {
    it("accepts a canonical https URL ending in /mcp/<id>", () => {
        expect(
            mcpProviderConfigError(provider({ resourceUrl: "https://api.example.org/mcp/prov-1" })),
        ).toBeUndefined();
    });

    it("ignores the config while MCP is off", () => {
        expect(
            mcpProviderConfigError(provider({ enabled: false, resourceUrl: "nonsense" })),
        ).toBeUndefined();
    });

    it.each([
        ["not a URL", "nonsense", "absolute URL"],
        ["plain http", "http://api.example.org/mcp/prov-1", "https"],
        ["a query", "https://api.example.org/mcp/prov-1?x=1", "query or fragment"],
        ["an uppercase host", "https://API.example.org/mcp/prov-1", "canonical form"],
        ["a trailing slash", "https://api.example.org/mcp/prov-1/", "end with /mcp/prov-1"],
        ["another provider's path", "https://api.example.org/mcp/prov-2", "end with /mcp/prov-1"],
    ])("rejects %s", (_name, resourceUrl, message) => {
        expect(mcpProviderConfigError(provider({ resourceUrl }))).toContain(message);
    });

    it("allows http for localhost", () => {
        expect(
            mcpProviderConfigError(provider({ resourceUrl: "http://localhost:3000/mcp/prov-1" })),
        ).toBeUndefined();
    });

    it("rejects a resource URL equal to the provider's audience", () => {
        const p = provider({ resourceUrl: "https://api.example.org/mcp/prov-1" });
        p.audience = "https://api.example.org/mcp/prov-1/";
        expect(mcpProviderConfigError(p)).toContain("differ from the provider's audience");
    });

    it("rejects a non-https CMS URL", () => {
        expect(
            mcpProviderConfigError(
                provider({
                    resourceUrl: "https://api.example.org/mcp/prov-1",
                    cmsUrl: "ftp://cms.example.org",
                }),
            ),
        ).toContain("cmsUrl");
    });
});

describe("mcpSettings", () => {
    it("returns nothing when MCP is off, absent or invalid", () => {
        expect(mcpSettings(undefined)).toBeUndefined();
        expect(mcpSettings(provider())).toBeUndefined();
        expect(mcpSettings(provider({ resourceUrl: "nonsense" }))).toBeUndefined();
    });

    it("returns the usable settings", () => {
        expect(
            mcpSettings(
                provider({
                    resourceUrl: "https://api.example.org/mcp/prov-1",
                    cmsUrl: "https://cms.example.org/",
                }),
            ),
        ).toEqual({
            resourceUrl: "https://api.example.org/mcp/prov-1",
            allowedClientIds: [],
            cmsUrl: "https://cms.example.org",
        });
    });
});

describe("protected resource metadata", () => {
    const settings = {
        resourceUrl: "https://api.example.org/mcp/prov-1",
        allowedClientIds: [],
    };

    it("inserts the well-known path before the resource path (RFC 9728)", () => {
        expect(protectedResourceMetadataUrl(settings.resourceUrl)).toBe(
            "https://api.example.org/.well-known/oauth-protected-resource/mcp/prov-1",
        );
    });

    it("points at the provider's issuer and advertises no scopes", () => {
        const metadata = protectedResourceMetadata(provider(), settings);
        expect(metadata).toEqual({
            resource: "https://api.example.org/mcp/prov-1",
            authorization_servers: ["https://tenant.example.auth0.com/"],
            bearer_methods_supported: ["header"],
            resource_name: "Luminary (Staff)",
        });
        expect(metadata).not.toHaveProperty("scopes_supported");
    });

    it("builds the 401 challenges", () => {
        const url = "https://api.example.org/.well-known/oauth-protected-resource/mcp/prov-1";
        expect(bearerChallenge(settings.resourceUrl)).toBe(`Bearer resource_metadata="${url}"`);
        expect(bearerChallenge(settings.resourceUrl, true)).toBe(
            `Bearer error="invalid_token", resource_metadata="${url}"`,
        );
    });
});

describe("hasMcpAccess", () => {
    it("is false for a CMS-only user", () => {
        const accessMap = {
            g1: { [DocType.Post]: { [AclPermission.CmsView]: true, [AclPermission.Edit]: true } },
        } as any;
        expect(hasMcpAccess(accessMap)).toBe(false);
    });

    it("is true with McpView on any doc type", () => {
        const accessMap = {
            g1: { [DocType.Post]: { [AclPermission.CmsView]: true } },
            g2: { [DocType.Redirect]: { [AclPermission.McpView]: true } },
        } as any;
        expect(hasMcpAccess(accessMap)).toBe(true);
    });

    it("is false without an accessMap", () => {
        expect(hasMcpAccess(undefined)).toBe(false);
    });
});

describe("mcpRateLimitKey", () => {
    it("uses the User doc id when linked", () => {
        expect(mcpRateLimitKey({ groups: [], userId: "u1", jwtPayload: { sub: "s" } }, "p")).toBe(
            "u1",
        );
    });

    it("falls back to provider and verified sub", () => {
        expect(mcpRateLimitKey({ groups: [], jwtPayload: { sub: "auth0|1" } }, "p")).toBe(
            "p:auth0|1",
        );
    });

    it("has no key without a user id or sub", () => {
        expect(mcpRateLimitKey({ groups: [] }, "p")).toBeUndefined();
    });
});
