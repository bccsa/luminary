# MCP server (AI connectors)

The API serves a [Model Context Protocol](https://modelcontextprotocol.io) server, so editors can
work with Luminary from AI apps such as Claude and ChatGPT: search and read content, draft posts,
tags and translations, and (with their confirmation) change published content, redirects and
languages. Design and rationale: [ADR 0020](../../docs/adr/0020-mcp-server-in-the-api.md).

## How it works

- There is one MCP URL per auth provider: `https://<api>/mcp/<providerId>`. Users sign in on that
  provider's login page, with the same account they use for the CMS.
- Access is controlled by the **`McpView`** ACL permission. Without it anywhere, a user gets
  `403`. With it, they can read what `McpView` allows, per group and doc type, and change what
  their normal write permissions (Edit, Translate, Publish, Assign) allow on documents they can
  read through MCP.
- Granting `McpView` also grants `CmsView`, so MCP never shows more than the CMS.
- Changes that reach app users are only applied after the user confirms them in their AI app.

## Turning it on

1. **Grant `McpView`.** In the CMS group editor, give `McpView` to the groups that may use AI tools,
   on the doc types they should reach. Content needs `McpView` on Post and/or Tag **and** on at
   least one Language. Nobody has `McpView` until an admin grants it.
2. **Set up the identity provider** (below).
3. **Enable the provider.** In the CMS, open *Auth Providers*, edit the provider, and switch on
   *AI connector (MCP)*:
   - *MCP URL* is filled in as `<CMS API URL>/mcp/<providerId>`. Keep it exactly as it is unless the
     API is reachable under another public URL.
   - *CMS URL* is used for links back to the CMS in AI answers.
   - *Allowed client IDs* is optional; see below.

   The API rejects an MCP URL that isn't canonical, doesn't end in `/mcp/<providerId>`, or equals
   the provider's audience.
4. Users find their connector URL in the CMS under *Settings → AI connector (MCP)*.

## Identity provider setup

The identity provider stays the OAuth authorization server; the API only checks tokens. It must:

- support PKCE and advertise it (`code_challenge_methods_supported`) in its discovery metadata;
- let AI apps get a client id: client ID metadata documents (CIMD), dynamic client registration
  (DCR), or apps you register yourself;
- issue a **JWT** access token whose `aud` is the MCP URL, when the app asks for that resource.

Auth0, Okta and Keycloak can; Entra ID and Google can't be used as they are.

**Auth0.** These steps follow Auth0's documentation and haven't been tried end to end against a
real tenant yet:

1. Create a new API whose **identifier is exactly the MCP URL**, signing algorithm RS256. Keep it
   separate from the API used by the CMS and app, whose identifier is the provider's `audience`.
2. Let the `resource` parameter that MCP clients send select that API (Auth0's resource parameter
   compatibility setting), so tokens are JWTs for the MCP URL.
3. Client registration, either:
   - enable dynamic client registration and/or client ID metadata documents, and make the login
     connection available to third-party apps (domain-level connection); or
   - register one application per AI app with that app's callback URL, and list their client ids
     under *Allowed client IDs*. The list can't work with self-registered apps, whose ids aren't
     known in advance.
4. Make sure the post-login Action that adds the email and group claims to access tokens also runs
   for the MCP API. Group mappings and user linking depend on them.
5. Keep access tokens for the MCP API short-lived; the apps refresh them.

## Connecting an AI app

Add a custom (remote MCP) connector in the app with the connector URL from the CMS Settings page,
and sign in when the app opens the provider's login page.

**Confirming live changes** uses MCP elicitation on protocol revision 2026-07-28. Apps that don't
support it can read and save drafts, but get an error when a change would reach app users; such
changes are made in the CMS. `whoami` reports `canConfirmLiveChanges` for the current app.

## Tools

| Tool | What it does |
|---|---|
| `whoami` | The user, their MCP access, where they can create posts/tags, translatable languages, whether the app can confirm live changes |
| `search` | Full-text search over post/tag translations (drafts included), or users/redirects |
| `fetch` | One document by id; long translation bodies are paginated (`textPage`) |
| `fetch_text` | The next part of a paginated body |
| `list_content` | Translations of posts or tags, newest change first, grouped by post/tag |
| `list_documents` | Documents of one other type (languages, redirects, groups, users, …) |
| `save_post` / `save_tag` | Create a post/tag, or change its groups, tags and settings (not images or media) |
| `save_translation` | Create a draft translation, or edit one (paginated bodies via `textChunks`) |
| `set_publish_status` | Publish, schedule, unpublish, set expiry (always confirmed) |
| `save_redirect` | Create or change a redirect (always confirmed) |
| `save_language` | Create or change a language and its UI strings (always confirmed; not the default language) |

Rules every write follows:
- Updates need the `version` from the latest read. A stale version returns a `conflict` with the
  current document.
- Writes go through the same validation as CMS saves.
- Writes need a login that is linked to a Luminary User.
- Body text is HTML limited to what the CMS editor produces.

## Limits and logs

- `MCP_RATE_LIMIT_*` caps tool calls per user (on by default; see `.env.example`). The query and
  change-request limiters still apply underneath.
- Every write logs one `MCP write` line: user, provider, client id, tool, document, result, and
  whether it was confirmed.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `404` from the MCP URL or its metadata | MCP isn't enabled on the provider, or its MCP settings are invalid |
| Sign-in succeeds but every request is `401` | The token's `aud` isn't the MCP URL (API identifier mismatch, or the `resource` parameter isn't honoured), or the client id isn't in *Allowed client IDs* |
| `403` "no MCP access" | The user has no `McpView`; or the access-token claims the group mappings rely on are missing for the MCP API |
| Content reads return `403` | `McpView` on Post/Tag but not on any Language |
| "needs your confirmation, which this app can't ask for" | The app doesn't support elicitation; make the change in the CMS |

## Code

- `src/mcp/mcp.controller.ts`: routes, token checks, the `McpView` gate, Fastify ↔ web request bridge.
- `src/mcp/mcp.service.ts`: per-request server, instructions, confirmation signing.
- `src/mcp/tools/`: read and write tools.
- `src/endpoints/requestPipeline.ts`: validation, caps and rate limits shared with REST.
- `src/endpoints/query.service.ts`: `filterReadable`, the predicate form of the read permission filter.
- Tests: `src/mcp/*.spec.ts` run without CouchDB. `src/mcp/mcp.parity.spec.ts` needs CouchDB: it
  compares MCP reads and writes with `/query` and change requests on the seeded data.
