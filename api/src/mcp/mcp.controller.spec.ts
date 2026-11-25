import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";
import { AuthIdentityService } from "../auth/authIdentity.service";
import { IdentityCacheService } from "../auth/identityCache.service";
import { QueryService } from "../endpoints/query.service";
import { FtsSearchService } from "../endpoints/ftsSearch.service";
import { ChangeRequestService } from "../endpoints/changeRequest.service";
import { DbService } from "../db/db.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { ChangeRequestRateLimiterService } from "../ratelimit/changeRequestRateLimiter.service";
import { McpRateLimiterService } from "../ratelimit/mcpRateLimiter.service";
import configuration from "../configuration";
import { AckStatus, AclPermission, DocType, PublishStatus } from "../enums";
import { docVersion } from "./mcpDocs";
import { TEXT_CHUNK_CHARS } from "./textPaging";

const RESOURCE = "http://localhost/mcp/prov-1";
const PROVIDER = {
    _id: "prov-1",
    type: DocType.AuthProvider,
    domain: "tenant.example.test",
    audience: "https://api.example.test",
    clientId: "cms-client",
    memberOf: [],
    mcp: { enabled: true, resourceUrl: RESOURCE, cmsUrl: "https://cms.example.test" },
};

const perms = (...p: AclPermission[]) => Object.fromEntries(p.map((x) => [x, true]));
const { McpView, CmsView, Edit, Translate, Publish, Assign } = AclPermission;

const USERS: Record<string, any> = {
    "editor-token": {
        groups: ["g1"],
        userId: "user-editor",
        name: "Editor",
        email: "editor@example.test",
        jwtPayload: { sub: "auth0|editor", azp: "claude-client" },
        accessMap: {
            g1: {
                [DocType.Post]: perms(McpView, CmsView, Edit, Translate, Publish),
                [DocType.Tag]: perms(McpView, CmsView, Edit, Translate),
                [DocType.Language]: perms(McpView, CmsView, Translate),
                [DocType.Group]: perms(McpView, CmsView, Assign),
                [DocType.Redirect]: perms(McpView, CmsView, Edit),
                [DocType.AutoGroupMappings]: perms(McpView, CmsView),
            },
        },
    },
    "cms-only-token": {
        groups: ["g1"],
        userId: "user-cms",
        jwtPayload: { sub: "auth0|cms" },
        accessMap: { g1: { [DocType.Post]: perms(CmsView, Edit) } },
    },
};

const LANG_ENG = {
    _id: "lang-eng",
    type: DocType.Language,
    languageCode: "eng",
    name: "English",
    default: 1,
    memberOf: ["g1"],
    translations: {},
};
const POST = {
    _id: "post-1",
    type: DocType.Post,
    postType: "blog",
    memberOf: ["g1"],
    tags: [],
    publishDateVisible: true,
    imageData: { fileCollections: [{ id: "keep-me" }] },
};
const PRIVATE_POST = { ...POST, _id: "post-private", memberOf: ["g-private"] };
const DRAFT = {
    _id: "content-draft",
    type: DocType.Content,
    parentId: "post-1",
    parentType: DocType.Post,
    parentPostType: "blog",
    language: "lang-eng",
    status: PublishStatus.Draft,
    title: "Draft title",
    slug: "draft-title",
    text: "<p>Draft body</p>",
    memberOf: ["g1"],
    fts: ["dra:1"],
};
const PUBLISHED = {
    ...DRAFT,
    _id: "content-published",
    status: PublishStatus.Published,
    title: "Live title",
    slug: "live-title",
    publishDate: Date.parse("2026-01-01T00:00:00Z"),
};
const LONG = {
    ...DRAFT,
    _id: "content-long",
    text: Array.from(
        { length: 3 },
        (_, i) => `<p>${i}${"x".repeat(TEXT_CHUNK_CHARS - 100)}</p>`,
    ).join(""),
};
const GROUP = {
    _id: "g1",
    type: DocType.Group,
    name: "Public content",
    memberOf: ["g1"],
    acl: [],
};
const TAG = {
    _id: "tag-1",
    type: DocType.Tag,
    tagType: "category",
    memberOf: ["g1"],
    tags: [],
    pinned: 0,
};
const TAG_CONTENT = {
    ...PUBLISHED,
    _id: "content-tag-1",
    parentId: "tag-1",
    parentType: DocType.Tag,
    parentPostType: undefined,
    parentTagType: "category",
    title: "News",
    slug: "news",
};
const REDIRECT = {
    _id: "redirect-1",
    type: DocType.Redirect,
    redirectType: "permanent",
    slug: "old",
    toSlug: "new",
    memberOf: ["g1"],
};
const MAPPING = {
    _id: "mapping-1",
    type: DocType.AutoGroupMappings,
    memberOf: ["g1"],
    groupIds: ["g1"],
    conditions: [],
};
const OTHER_DOC = {
    _id: "other-doc",
    type: DocType.Post,
    memberOf: ["g1"],
    note: "other-doc-body",
};

describe("McpController (HTTP + MCP tools)", () => {
    let app: NestFastifyApplication;
    let docs: Map<string, any>;
    let changeRequest: jest.Mock;
    let resolveForMcp: jest.Mock;
    let searchWithStats: jest.Mock;
    let logger: any;
    let db: any;
    /** The confirmation texts the user was shown. */
    let elicited: string[];

    beforeAll(() => {
        process.env.ENCRYPTION_KEY =
            process.env.ENCRYPTION_KEY || "test-encryption-key-for-mcp-spec";
    });

    beforeEach(async () => {
        docs = new Map(
            [
                PROVIDER,
                LANG_ENG,
                POST,
                PRIVATE_POST,
                DRAFT,
                PUBLISHED,
                LONG,
                GROUP,
                TAG,
                TAG_CONTENT,
                REDIRECT,
                MAPPING,
            ].map((d) => [d._id, structuredClone(d)]),
        );
        elicited = [];
        db = {
            on: jest.fn(),
            getDoc: jest.fn(async (id: string) => ({
                docs: docs.has(id) ? [structuredClone(docs.get(id))] : [],
            })),
            getDocs: jest.fn(async (ids: string[], types: DocType[]) => ({
                docs: ids
                    .map((id) => docs.get(id))
                    .filter((d) => d && types.includes(d.type))
                    .map((d) => structuredClone(d)),
            })),
            getContentByParentId: jest.fn(async (parentId: string | string[]) => {
                const ids = Array.isArray(parentId) ? parentId : [parentId];
                return {
                    docs: [...docs.values()].filter(
                        (d) => d.type === DocType.Content && ids.includes(d.parentId),
                    ),
                };
            }),
            // Enough of Mango for the tools' queries: equality, the permission filter on
            // memberOf, the paging bound on updatedTimeUtc, sort and limit.
            executeFindQuery: jest.fn(async (query: any) => {
                const conditions: any[] = query.selector?.$and ?? [query.selector ?? {}];
                const field = (name: string) =>
                    conditions.find((c) => c[name] !== undefined)?.[name];
                let found = [...docs.values()].filter((d) => d.type === field("type"));
                for (const name of ["parentType", "parentPostType", "parentTagType", "language"])
                    if (field(name) !== undefined)
                        found = found.filter((d) => d[name] === field(name));
                const groups = field("memberOf")?.$elemMatch?.$in;
                if (groups)
                    found = found.filter((d) =>
                        d.memberOf?.some((g: string) => groups.includes(g)),
                    );
                const before = field("updatedTimeUtc")?.$lte;
                if (before !== undefined)
                    found = found.filter((d) => (d.updatedTimeUtc ?? 0) <= before);
                if (query.sort)
                    found.sort((a, b) => (b.updatedTimeUtc ?? 0) - (a.updatedTimeUtc ?? 0));
                return {
                    docs: found
                        .slice(0, query.limit ?? found.length)
                        .map((d) => structuredClone(d)),
                    execution_stats: { total_docs_examined: 1, total_keys_examined: 1 },
                };
            }),
        };
        changeRequest = jest.fn(async (cr: any) => {
            docs.set(cr.doc._id, { ...structuredClone(cr.doc), updatedTimeUtc: Date.now() });
            return { ack: AckStatus.Accepted };
        });
        resolveForMcp = jest.fn(async (token: string) => {
            if (!USERS[token]) throw new UnauthorizedException();
            return USERS[token];
        });
        searchWithStats = jest.fn(async () => ({
            results: [{ docId: DRAFT._id, score: 1, wordMatchScore: 0, doc: DRAFT }],
            stats: { estimatedCandidateRows: 0, candidateRows: 0, candidateRowBudget: 1 },
        }));
        logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

        const moduleRef = await Test.createTestingModule({
            controllers: [McpController],
            providers: [
                McpService,
                QueryService,
                QueryRateLimiterService,
                ChangeRequestRateLimiterService,
                McpRateLimiterService,
                { provide: ConfigService, useValue: new ConfigService(configuration()) },
                { provide: DbService, useValue: db },
                { provide: FtsSearchService, useValue: { searchWithStats } },
                { provide: ChangeRequestService, useValue: { changeRequest } },
                {
                    provide: AuthIdentityService,
                    useValue: { getProvider: async (id: string) => docs.get(id) },
                },
                { provide: IdentityCacheService, useValue: { resolveForMcp } },
                { provide: WINSTON_MODULE_PROVIDER, useValue: logger },
            ],
        }).compile();

        app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
        await app.init();
        await app.getHttpAdapter().getInstance().ready();
        // Let QueryService load its language cache.
        await new Promise((resolve) => setImmediate(resolve));
    });

    afterEach(async () => {
        await app.close();
    });

    /** fetch() for the MCP client that goes through the Nest app in-process. */
    const viaApp =
        (token?: string) =>
        async (url: string | URL, init: RequestInit = {}): Promise<Response> => {
            const target = new URL(String(url));
            const headers: Record<string, string> = Object.fromEntries(
                new Headers(init.headers).entries(),
            );
            if (token) headers.authorization = `Bearer ${token}`;
            const res = await app.inject({
                method: (init.method ?? "GET") as any,
                url: target.pathname + target.search,
                headers,
                payload: init.body as any,
            });
            const out = new Headers();
            for (const [k, v] of Object.entries(res.headers))
                if (v !== undefined) out.set(k, String(v));
            return new Response(
                [204, 304].includes(res.statusCode) ? null : new Uint8Array(res.rawPayload),
                {
                    status: res.statusCode,
                    headers: out,
                },
            );
        };

    async function connect(
        token: string,
        mode: "modern" | "legacy" = "modern",
        answer?: "accept" | "decline" | "cancel" | "unticked",
    ) {
        const client = new Client({ name: "spec-client", version: "0.0.0" }, {
            capabilities: answer ? { elicitation: {} } : {},
            ...(mode === "modern" ? { versionNegotiation: { mode: "auto" } } : {}),
        } as any);
        if (answer) {
            client.setRequestHandler("elicitation/create" as any, async (request: any) => {
                elicited.push(request.params.message);
                if (answer === "accept") return { action: "accept", content: { confirm: true } };
                if (answer === "unticked") return { action: "accept", content: { confirm: false } };
                return { action: answer };
            });
        }
        await client.connect(
            new StreamableHTTPClientTransport(new URL(RESOURCE), { fetch: viaApp(token) } as any),
        );
        return client;
    }

    const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
        (await client.callTool({ name, arguments: args })) as any;

    describe("HTTP contract", () => {
        it("serves RFC 9728 metadata for an MCP-enabled provider", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/.well-known/oauth-protected-resource/mcp/prov-1",
            });
            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({
                resource: RESOURCE,
                authorization_servers: ["https://tenant.example.test/"],
                bearer_methods_supported: ["header"],
                resource_name: "Luminary (tenant.example.test)",
            });
        });

        it.each([
            ["an unknown provider", "/mcp/nope"],
            ["a non-provider doc", "/mcp/post-1"],
            ["a CouchDB special path", "/mcp/_all_docs"],
        ])("answers 404 for %s", async (_name, url) => {
            const res = await app.inject({ method: "POST", url, payload: {} });
            expect(res.statusCode).toBe(404);
        });

        it("answers 404 when MCP is disabled on the provider", async () => {
            docs.get("prov-1").mcp.enabled = false;
            const res = await app.inject({ method: "POST", url: "/mcp/prov-1", payload: {} });
            expect(res.statusCode).toBe(404);
        });

        it("challenges a request without a token", async () => {
            const res = await app.inject({ method: "POST", url: "/mcp/prov-1", payload: {} });
            expect(res.statusCode).toBe(401);
            expect(res.headers["www-authenticate"]).toBe(
                'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp/prov-1"',
            );
        });

        it("challenges an invalid token with error=invalid_token", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/mcp/prov-1",
                headers: { authorization: "Bearer bad-token" },
                payload: {},
            });
            expect(res.statusCode).toBe(401);
            expect(res.headers["www-authenticate"]).toContain('error="invalid_token"');
        });

        it("verifies tokens against the MCP resource, not the provider's API audience", async () => {
            await app.inject({
                method: "POST",
                url: "/mcp/prov-1",
                headers: { authorization: "Bearer editor-token" },
                payload: {},
            });
            expect(resolveForMcp).toHaveBeenCalledWith("editor-token", "prov-1", {
                audience: RESOURCE,
                allowedClientIds: [],
            });
        });

        it("answers 503, not a token challenge, when sign-in can't be checked", async () => {
            resolveForMcp.mockRejectedValueOnce(new ServiceUnavailableException("down"));
            const res = await app.inject({
                method: "POST",
                url: "/mcp/prov-1",
                headers: { authorization: "Bearer editor-token" },
                payload: {},
            });
            expect(res.statusCode).toBe(503);
            expect(res.headers["retry-after"]).toBe("5");
            expect(res.headers["www-authenticate"]).toBeUndefined();
        });

        it("answers a plain 403, without a challenge, to a user without McpView", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/mcp/prov-1",
                headers: { authorization: "Bearer cms-only-token" },
                payload: {},
            });
            expect(res.statusCode).toBe(403);
            expect(res.headers["www-authenticate"]).toBeUndefined();
            expect(res.json().message).toContain("McpView");
        });
    });

    describe("read tools", () => {
        it("lists the v1 tools", async () => {
            const client = await connect("editor-token");
            const { tools } = await client.listTools();
            expect(tools.map((t) => t.name).sort()).toEqual(
                [
                    "fetch",
                    "fetch_text",
                    "list_content",
                    "list_documents",
                    "save_language",
                    "save_post",
                    "save_redirect",
                    "save_tag",
                    "save_translation",
                    "search",
                    "set_publish_status",
                    "whoami",
                ].sort(),
            );
            await client.close();
        });

        it("whoami describes access and where the user can create", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "whoami");
            expect(res.structuredContent.user.userId).toBe("user-editor");
            expect(res.structuredContent.createPostsIn.map((g: any) => g.id)).toEqual(["g1"]);
            expect(res.structuredContent.languages[0]).toMatchObject({
                code: "eng",
                canTranslate: true,
            });
            expect(res.structuredContent.canConfirmLiveChanges).toBe(true);
            await client.close();
        });

        it("fetch returns a readable translation in the standard shape, without index fields", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "fetch", { id: DRAFT._id });
            expect(res.structuredContent).toMatchObject({
                id: DRAFT._id,
                title: "Draft title",
                text: "<p>Draft body</p>",
                url: "https://cms.example.test/post/edit/blog/post-1/eng",
            });
            expect(res.structuredContent.metadata.version).toBe(docVersion(DRAFT));
            expect(JSON.stringify(res)).not.toContain("dra:1");
            await client.close();
        });

        it("fetch hides documents outside the user's McpView groups", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "fetch", { id: PRIVATE_POST._id });
            expect(res.isError).toBe(true);
            await client.close();
        });

        it("fetch lists a post's translations without their text", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "fetch", { id: POST._id });
            const translations = res.structuredContent.metadata.translations;
            expect(translations.map((t: any) => t.id).sort()).toEqual(
                [DRAFT._id, PUBLISHED._id, LONG._id].sort(),
            );
            expect(JSON.stringify(translations)).not.toContain("<p>");
            expect(res.structuredContent.metadata).not.toHaveProperty("imageData");
            await client.close();
        });

        it("paginates a long body and continues with fetch_text", async () => {
            const client = await connect("editor-token");
            const first = await call(client, "fetch", { id: LONG._id });
            const page = first.structuredContent.metadata.textPage;
            expect(page).toMatchObject({ index: 0, count: 3 });

            const second = await call(client, "fetch_text", {
                id: LONG._id,
                cursor: page.nextCursor,
            });
            expect(second.structuredContent).toMatchObject({ index: 1, count: 3 });
            expect(second.structuredContent.text.startsWith("<p>1")).toBe(true);
            await client.close();
        });

        it("search runs in McpView mode and returns the standard result shape", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "search", { query: "draft" });
            expect(searchWithStats).toHaveBeenCalledWith(
                expect.objectContaining({ queryString: "draft", cms: true }),
                USERS["editor-token"],
                { mcp: true },
            );
            expect(res.structuredContent.results[0]).toMatchObject({
                id: DRAFT._id,
                title: "Draft title",
                url: "https://cms.example.test/post/edit/blog/post-1/eng",
            });
            await client.close();
        });

        it("list_content groups translations under their post, through the content index", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "list_content", { parentType: "post" });

            expect(res.structuredContent.items).toHaveLength(1);
            expect(res.structuredContent.items[0]).toMatchObject({
                id: "post-1",
                url: "https://cms.example.test/post/edit/blog/post-1",
            });
            expect(
                res.structuredContent.items[0].translations.map((t: any) => t.id).sort(),
            ).toEqual([DRAFT._id, PUBLISHED._id, LONG._id].sort());
            expect(JSON.stringify(res)).not.toContain("<p>");

            const query = db.executeFindQuery.mock.calls.at(-1)[0];
            expect(query.use_index).toBe("sync-post-content-index");
            await client.close();
        });

        it("list_content filters by subtype and uses the tag index for tags", async () => {
            const client = await connect("editor-token");
            const tags = await call(client, "list_content", {
                parentType: "tag",
                subtype: "category",
            });
            expect(tags.structuredContent.items.map((i: any) => i.id)).toEqual(["tag-1"]);
            expect(db.executeFindQuery.mock.calls.at(-1)[0].use_index).toBe(
                "sync-tag-content-index",
            );

            const none = await call(client, "list_content", {
                parentType: "tag",
                subtype: "topic",
            });
            expect(none.structuredContent.items).toEqual([]);
            await client.close();
        });

        it("list_documents pages through documents that share a timestamp, each exactly once", async () => {
            docs.delete(REDIRECT._id);
            const times = [50, 40, 40, 40, 10];
            times.forEach((updatedTimeUtc, i) =>
                docs.set(`r${i}`, { ...REDIRECT, _id: `r${i}`, slug: `s${i}`, updatedTimeUtc }),
            );
            docs.set("r-private", {
                ...REDIRECT,
                _id: "r-private",
                memberOf: ["g-private"],
                updatedTimeUtc: 45,
            });

            const client = await connect("editor-token");
            const seen: string[] = [];
            let cursor: string | undefined;
            for (let page = 0; page < 10; page++) {
                const res = await call(client, "list_documents", {
                    docType: "redirect",
                    limit: 2,
                    ...(cursor ? { cursor } : {}),
                });
                seen.push(...res.structuredContent.items.map((i: any) => i.id));
                cursor = res.structuredContent.nextCursor;
                if (!cursor) break;
            }

            expect(seen).toEqual(["r0", "r1", "r2", "r3", "r4"]);
            await client.close();
        });

        it("list_documents reads auto group mappings without an index", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "list_documents", { docType: "autoGroupMappings" });

            expect(res.structuredContent.items.map((i: any) => i.id)).toEqual(["mapping-1"]);
            expect(db.executeFindQuery.mock.calls.at(-1)[0].use_index).toBeUndefined();
            await client.close();
        });

        it("rejects a malformed cursor as invalid, not as an internal error", async () => {
            const client = await connect("editor-token");
            const cursor = Buffer.from(JSON.stringify({ ts: 1 })).toString("base64url");
            const res = await call(client, "list_documents", { docType: "redirect", cursor });

            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("Invalid cursor");
            expect(logger.error).not.toHaveBeenCalled();
            await client.close();
        });

        it("returns a retry hint once the caller hits the MCP rate limit", async () => {
            const client = await connect("editor-token");
            const limiter = app.get(McpRateLimiterService);
            const check = jest
                .spyOn(limiter, "check")
                .mockReturnValue({ allowed: false, retryAfterMs: 2500 });

            const res = await call(client, "whoami");
            expect(res.isError).toBe(true);
            expect(res.structuredContent.retryAfterSeconds).toBe(3);
            expect(check).toHaveBeenCalledWith("user-editor");
            await client.close();
        });

        it("rejects unknown arguments (strict schemas)", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "fetch", { id: DRAFT._id, extra: 1 });
            expect(res.isError).toBe(true);
            await client.close();
        });
    });

    describe("write tools", () => {
        it("creates a draft translation in one call, shaped like a CMS one", async () => {
            for (const id of [DRAFT._id, PUBLISHED._id, LONG._id]) docs.delete(id);
            const client = await connect("editor-token", "legacy");
            const res = await call(client, "save_translation", {
                parentId: "post-1",
                language: "eng",
                title: "Tom & Jerry!",
            });

            expect(res.structuredContent.status).toBe("applied");
            const submitted = changeRequest.mock.calls[0][0].doc;
            expect(submitted).toMatchObject({
                type: DocType.Content,
                parentId: "post-1",
                parentType: DocType.Post,
                language: "lang-eng",
                status: PublishStatus.Draft,
                slug: "tom-and-jerry",
            });
            expect(logger.info).toHaveBeenCalledWith(
                "MCP write",
                expect.objectContaining({ tool: "save_translation", clientId: "claude-client" }),
            );
            await client.close();
        });

        it("refuses a second translation in the same language", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "save_translation", {
                parentId: "post-1",
                language: "eng",
                title: "Another",
            });
            expect(res.isError).toBe(true);
            expect(changeRequest).not.toHaveBeenCalled();
            await client.close();
        });

        it("requires the current version and returns a conflict otherwise", async () => {
            const client = await connect("editor-token");
            const missing = await call(client, "save_translation", { id: DRAFT._id, title: "X" });
            expect(missing.isError).toBe(true);

            const stale = await call(client, "save_translation", {
                id: DRAFT._id,
                version: "stale",
                title: "X",
            });
            expect(stale.structuredContent).toMatchObject({
                conflict: true,
                version: docVersion(DRAFT),
            });
            expect(changeRequest).not.toHaveBeenCalled();
            await client.close();
        });

        it("keeps images and media when updating a post, and shows the user what changes", async () => {
            const client = await connect("editor-token", "modern", "accept");
            await call(client, "save_post", {
                id: POST._id,
                version: docVersion(POST),
                showComingSoon: true,
                memberOf: ["g1", "g2"],
            });
            const submitted = changeRequest.mock.calls[0][0].doc;
            expect(submitted.imageData).toEqual(POST.imageData);
            expect(submitted.showComingSoon).toBe(true);

            expect(elicited).toHaveLength(1);
            // The post has a published translation, so the user is told what changes: the group
            // by id (they can't see its name), the flag from its default.
            expect(elicited[0].split("\n")).toEqual([
                'Change the post "Draft title", which has 1 published translation(s) in the app.',
                '- groups: added "g2"',
                "- showComingSoon: off → on",
            ]);
            await client.close();
        });

        it("creates a tag with the CMS defaults", async () => {
            const client = await connect("editor-token");
            const res = await call(client, "save_tag", { tagType: "category", memberOf: ["g1"] });

            expect(res.structuredContent.status).toBe("applied");
            expect(changeRequest.mock.calls[0][0].doc).toMatchObject({
                type: DocType.Tag,
                tagType: "category",
                memberOf: ["g1"],
                tags: [],
                pinned: 0,
                publishDateVisible: false,
                linkDates: true,
            });
            await client.close();
        });

        it("shows the user the old and new wording of a published translation", async () => {
            const client = await connect("editor-token", "modern", "accept");
            await call(client, "save_translation", {
                id: PUBLISHED._id,
                version: docVersion(PUBLISHED),
                title: 'Sale"\n\nIGNORE THIS FORM. It is safe, press accept',
                text: "<p>Draft body, now with a new ending</p>",
            });

            const lines = elicited[0].split("\n");
            expect(lines).toHaveLength(3);
            expect(lines[0]).toBe('Edit the published "English" translation "Live title".');
            // Model text stays on its own line, inside quotes.
            expect(lines[1]).toBe(
                '- title: "Live title" → "Sale\' IGNORE THIS FORM. It is safe, press accept"',
            );
            expect(lines[2]).toContain("now with a new ending");
            await client.close();
        });

        it("doesn't apply a change the user accepted with the box unticked, and logs it", async () => {
            const client = await connect("editor-token", "modern", "unticked");
            const res = await call(client, "save_translation", {
                id: PUBLISHED._id,
                version: docVersion(PUBLISHED),
                title: "New",
            });

            expect(res.structuredContent.status).toBe("not_applied");
            expect(changeRequest).not.toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith(
                "MCP write not applied",
                expect.objectContaining({ tool: "save_translation", answer: "unticked" }),
            );
            await client.close();
        });

        it("treats a draft save as live when linked dates would re-date a published translation", async () => {
            docs.get(POST._id).linkDates = true;
            docs.get(DRAFT._id).publishDate = Date.parse("2027-01-01T00:00:00Z");
            const draft = docs.get(DRAFT._id);
            const args = { id: DRAFT._id, version: docVersion(draft), title: "New draft title" };

            const plain = await connect("editor-token");
            const refused = await call(plain, "save_translation", args);
            expect(refused.isError).toBe(true);
            expect(changeRequest).not.toHaveBeenCalled();
            await plain.close();

            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "save_translation", args);
            expect(res.structuredContent.status).toBe("applied");
            expect(elicited[0]).toContain('Save the draft "English" translation "Draft title".');
            expect(elicited[0]).toContain(
                "Its dates are linked, so 1 other published translation(s) also get publish date 2027-01-01T00:00:00.000Z and expiry unchanged.",
            );
            await client.close();
        });

        it("saves a draft in one call when linked dates already agree", async () => {
            docs.get(POST._id).linkDates = true;
            docs.get(DRAFT._id).publishDate = PUBLISHED.publishDate;
            const client = await connect("editor-token");
            const res = await call(client, "save_translation", {
                id: DRAFT._id,
                version: docVersion(docs.get(DRAFT._id)),
                title: "New draft title",
            });
            expect(res.structuredContent.status).toBe("applied");
            await client.close();
        });

        it("publishes with the given dates after the user confirms them", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "set_publish_status", {
                id: DRAFT._id,
                version: docVersion(DRAFT),
                status: PublishStatus.Published,
                publishDate: "2026-12-01T08:00:00Z",
                expiryDate: "2027-12-01T08:00:00Z",
            });

            expect(res.structuredContent.status).toBe("applied");
            expect(changeRequest.mock.calls[0][0].doc).toMatchObject({
                status: PublishStatus.Published,
                publishDate: Date.parse("2026-12-01T08:00:00Z"),
                expiryDate: Date.parse("2027-12-01T08:00:00Z"),
            });
            expect(elicited[0].split("\n")).toEqual([
                'Publish the "English" translation "Draft title".',
                "- status: draft → published",
                "- publish date: none → 2026-12-01T08:00:00.000Z",
                "- expiry: none → 2027-12-01T08:00:00.000Z",
            ]);
            await client.close();
        });

        it("refuses an expiry that isn't after the publish date, before asking the user", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "set_publish_status", {
                id: DRAFT._id,
                version: docVersion(DRAFT),
                status: PublishStatus.Published,
                publishDate: "2026-12-01T08:00:00Z",
                expiryDate: "2026-11-01T08:00:00Z",
            });
            expect(res.isError).toBe(true);
            expect(elicited).toEqual([]);
            await client.close();
        });

        it("normalises a new redirect's slugs like the CMS and shows them to the user", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "save_redirect", {
                redirectType: "permanent",
                slug: "/Old Page",
                toSlug: "New-Page",
                memberOf: ["g1"],
            });

            expect(res.structuredContent.status).toBe("applied");
            expect(changeRequest.mock.calls[0][0].doc).toMatchObject({
                type: DocType.Redirect,
                slug: "oldpage",
                toSlug: "new-page",
                memberOf: ["g1"],
            });
            expect(elicited[0].split("\n")).toEqual([
                "Create a redirect.",
                '- redirectType: "permanent"',
                '- slug: "oldpage"',
                '- toSlug: "new-page"',
                '- groups: added "Public content"',
            ]);
            await client.close();
        });

        it("points a redirect at the homepage when its target is emptied", async () => {
            const client = await connect("editor-token", "modern", "accept");
            await call(client, "save_redirect", {
                id: REDIRECT._id,
                version: docVersion(REDIRECT),
                toSlug: "",
            });

            expect(changeRequest.mock.calls[0][0].doc).not.toHaveProperty("toSlug");
            expect(elicited[0]).toContain('- toSlug: "new" → "the homepage"');
            await client.close();
        });

        it("refuses a redirect slug with nothing usable in it", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "save_redirect", {
                redirectType: "permanent",
                slug: " / ",
                memberOf: ["g1"],
            });
            expect(res.isError).toBe(true);
            expect(changeRequest).not.toHaveBeenCalled();
            await client.close();
        });

        it("merges a language's UI strings key by key and shows each change", async () => {
            docs.get(LANG_ENG._id).translations = { a: "A", b: "B", keep: "K" };
            const stored = docs.get(LANG_ENG._id);
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "save_language", {
                id: LANG_ENG._id,
                version: docVersion(stored),
                averageReadingSpeed: 200,
                translations: { a: "A2", b: null, c: "C" },
            });

            expect(res.structuredContent.status).toBe("applied");
            const submitted = changeRequest.mock.calls[0][0].doc;
            expect(submitted.translations).toEqual({ a: "A2", keep: "K", c: "C" });
            expect(submitted.default).toBe(1);
            expect(elicited[0].split("\n")).toEqual([
                'Change the language "English" ("eng"), which every app user sees.',
                "- averageReadingSpeed: (empty) → 200",
                '- string "a": "A" → "A2"',
                '- string "b": removed (was "B")',
                '- string "c": "C"',
            ]);
            await client.close();
        });

        it("doesn't let a language's default flag or a fractional reading speed through", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const base = { id: LANG_ENG._id, version: docVersion(LANG_ENG) };

            expect((await call(client, "save_language", { ...base, default: 0 })).isError).toBe(
                true,
            );
            expect(
                (await call(client, "save_language", { ...base, averageReadingSpeed: 1.5 }))
                    .isError,
            ).toBe(true);
            expect(changeRequest).not.toHaveBeenCalled();
            await client.close();
        });

        it("asks the user before changing a published translation, and applies on accept", async () => {
            const client = await connect("editor-token", "modern", "accept");
            const res = await call(client, "save_translation", {
                id: PUBLISHED._id,
                version: docVersion(PUBLISHED),
                title: "New live title",
            });
            expect(res.structuredContent.status).toBe("applied");
            expect(changeRequest.mock.calls[0][0].doc.title).toBe("New live title");
            expect(logger.info).toHaveBeenCalledWith(
                "MCP write",
                expect.objectContaining({ confirmed: true }),
            );
            await client.close();
        });

        it.each(["decline", "cancel"] as const)(
            "changes nothing when the user answers %s",
            async (answer) => {
                const client = await connect("editor-token", "modern", answer);
                const res = await call(client, "set_publish_status", {
                    id: DRAFT._id,
                    version: docVersion(DRAFT),
                    status: PublishStatus.Published,
                });
                expect(res.structuredContent.status).toBe("not_applied");
                expect(changeRequest).not.toHaveBeenCalled();
                expect(logger.info).toHaveBeenCalledWith(
                    "MCP write not applied",
                    expect.objectContaining({ tool: "set_publish_status" }),
                );
                await client.close();
            },
        );

        it.each([
            ["a 2025-era client", "legacy"],
            ["a client without elicitation", "modern"],
        ] as const)("refuses live changes from %s", async (_name, mode) => {
            const client = await connect("editor-token", mode);
            const res = await call(client, "set_publish_status", {
                id: DRAFT._id,
                version: docVersion(DRAFT),
                status: PublishStatus.Published,
            });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("needs your confirmation");
            expect(changeRequest).not.toHaveBeenCalled();
            await client.close();
        });

        it("returns only the message of a rejected change request", async () => {
            changeRequest.mockResolvedValueOnce({
                ack: AckStatus.Rejected,
                message: "No access",
                docs: [OTHER_DOC],
            });
            const client = await connect("editor-token");
            const res = await call(client, "save_translation", {
                id: DRAFT._id,
                version: docVersion(DRAFT),
                title: "X",
            });
            expect(res.isError).toBe(true);
            expect(JSON.stringify(res)).not.toContain("other-doc-body");
            await client.close();
        });

        it("refuses writes from a login that isn't linked to a User doc", async () => {
            USERS["unlinked-token"] = { ...USERS["editor-token"], userId: undefined };
            const client = await connect("unlinked-token");
            const res = await call(client, "save_translation", {
                id: DRAFT._id,
                version: docVersion(DRAFT),
                title: "X",
            });
            expect(res.isError).toBe(true);
            expect(changeRequest).not.toHaveBeenCalled();
            delete USERS["unlinked-token"];
            await client.close();
        });

        it("edits a paginated body only through textChunks", async () => {
            const client = await connect("editor-token");
            const whole = await call(client, "save_translation", {
                id: LONG._id,
                version: docVersion(LONG),
                text: "<p>replaced</p>",
            });
            expect(whole.isError).toBe(true);

            await call(client, "save_translation", {
                id: LONG._id,
                version: docVersion(LONG),
                textChunks: [{ index: 1, html: "<p>new middle</p>" }],
            });
            const text: string = changeRequest.mock.calls[0][0].doc.text;
            expect(text).toContain("<p>new middle</p>");
            expect(text.startsWith("<p>0")).toBe(true);
            expect(text).toContain("<p>2");
            await client.close();
        });
    });
});
