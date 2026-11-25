# 20. MCP server for AI clients, built into the API and gated by McpView

Date: 2026-11-24

## Status

Accepted

## Context

CMS editors want to work with Luminary content from AI apps such as Claude (Desktop and claude.ai)
and ChatGPT. Those apps connect to remote tools through the Model Context Protocol (MCP) over
Streamable HTTP, and sign users in with OAuth 2.1 (authorization code + PKCE). They can't send
custom headers such as `x-auth-provider-id`, and they discover the authorization server through
the server's RFC 9728 protected resource metadata.

Requirements:

- Only users explicitly allowed to use AI tools may connect, and what they can read and change
  must follow the existing permission rules exactly.
- Luminary supports several auth providers per deployment ("bring your own auth").
- The MCP spec (revision 2026-07-28) forbids an MCP server from passing the client's token through
  to an upstream API, and requires the server to accept only tokens issued for itself.
- AI agents act on text they read. Content in the CMS can contain injected instructions, so
  changes that reach app users need a human in the loop.

## Decision

**Placement.** The MCP server is a module of the existing API (`api/src/mcp/`), not a separate
service. Its tools call the same services the REST endpoints use (`QueryService`,
`FtsSearchService`, `ChangeRequestService` → `validateChangeRequestAccess`). The validation, caps,
rate limits and expensive-request logging the REST controllers add were extracted into shared
functions (`endpoints/requestPipeline.ts`) so both transports run them. A separate service would
either duplicate the change feed, permission graph and identity caches, or call the REST API with
the user's token, which the spec forbids.

**Authorization server.** Each AuthProvider's own identity provider stays the OAuth authorization
server; the API is only the resource server. Luminary doesn't issue tokens.

**One MCP URL per provider.** The endpoint is `/mcp/<providerId>`, with metadata at
`/.well-known/oauth-protected-resource/mcp/<providerId>` pointing at that provider's issuer. MCP
clients pick one authorization server, so one URL can't serve several providers. Each provider
opts in on its AuthProvider doc (`mcp: { enabled, resourceUrl, allowedClientIds?, cmsUrl? }`),
edited in the CMS. `resourceUrl` must be the canonical URL ending in `/mcp/<_id>`, equal to the
identifier of a separate API in the identity provider, and different from the provider's
`audience`.

**Token verification.** MCP tokens are verified like CMS tokens (issuer, JWKS, RS256, group
mappings, User linking), except that the audience must be `mcp.resourceUrl` and the CMS client-id
pin is replaced by the optional `allowedClientIds` list: MCP clients register their own client ids
(CIMD or DCR). There is no anonymous fallback: a missing or invalid token gets a 401 with an OAuth
challenge.

**`McpView` permission.** A new ACL permission gates the MCP server and every MCP read, the same way
`CmsView` gates the CMS (ADR 0013). MCP reads are CMS-scoped reads (drafts, scheduled and expired
docs visible) with `McpView` in place of `CmsView`. Granting `McpView` always adds `CmsView`, so MCP
access is a subset of CMS access, and CMS permissions never imply it. It is never granted by a
schema upgrade: admins opt groups in. A user without `McpView` anywhere gets a plain 403 (no OAuth
challenge, which would make clients loop). Content needs `McpView` on at least one Language, as
`/query` does; one Language grant covers every language.

**Writes.** v1 can write posts, tags, translations, publish status, redirects and languages, through
the same change-request pipeline, plus one MCP rule: the user needs `McpView` on the target.
Updates require the `version` (a hash of the editable fields) from the latest read, so a model
can't overwrite a change it hasn't seen. Deletes and admin doc types (Group, User, Storage,
AuthProvider, AutoGroupMappings, DefaultAffinity) are out of scope. Image and media uploads,
`/storage/encoderconfig` and `/sidecar` are never exposed.

**Confirming live changes.** Any write that reaches app users (published or scheduled content, a
post or tag with a published translation, any redirect or language) is only applied after the human
confirms it through MCP elicitation (`input_required` in revision 2026-07-28). The server writes the
confirmation text from the stored document and signs the pending change into `requestState` (keyed
from `ENCRYPTION_KEY`, bound to the caller, the document version and the requested change). A
client that can't ask the human gets an error for live changes; there is no fallback. Drafts and new
documents save in one call.

**Transport.** Stateless Streamable HTTP via the SDK's `createMcpHandler`, serving both 2026-07-28
and 2025-era clients from one endpoint, with a fresh server instance per request bound to the
verified caller. No sessions, so no sticky routing.

**Rate limit and audit.** A dedicated per-identity limiter counts every tool call (default on,
`MCP_RATE_LIMIT_*`), keyed only on the verified identity. Every write logs one structured line
(user, provider, client id, tool, document, result, whether it was confirmed).

## Consequences

- Admins enable MCP per provider and grant `McpView` per group and doc type; nothing changes for
  anyone until they do.
- Each identity provider must support PKCE and either client ID metadata documents, dynamic client
  registration, or pre-registered clients, and must issue a JWT for the MCP resource. Auth0, Okta and
  Keycloak can; Entra ID and Google can't be used as-is.
- Clients that can't elicit (2025-era clients, some desktop apps) can read and draft but can't change
  live content.
- `McpView` is a new `AclPermission` value: the API must deploy before the CMS (ADR 0005), because an
  older API rejects it in group ACLs.
- The request pipeline is shared by REST and MCP, so a change to validation or rate limiting applies
  to both.
- Writes follow the change-request validator's rules, so a change to those rules applies to both
  transports.
