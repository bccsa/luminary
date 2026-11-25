import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { UnauthorizedException } from "@nestjs/common";
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

    beforeAll(() => {
        process.env.ENCRYPTION_KEY =
            process.env.ENCRYPTION_KEY || "test-encryption-key-for-mcp-spec";
    });

    beforeEach(async () => {
        docs = new Map(
            [PROVIDER, LANG_ENG, POST, PRIVATE_POST, DRAFT, PUBLISHED, LONG].map((d) => [
                d._id,
                structuredClone(d),
            ]),
        );
        const db = {
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
            executeFindQuery: jest.fn(async (query: any) => {
                const type =
                    query.selector?.type ?? query.selector?.$and?.find((c: any) => c.type)?.type;
                return {
                    docs: [...docs.values()].filter((d) => d.type === type),
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
        answer?: "accept" | "decline" | "cancel",
    ) {
        const client = new Client({ name: "spec-client", version: "0.0.0" }, {
            capabilities: answer ? { elicitation: {} } : {},
            ...(mode === "modern" ? { versionNegotiation: { mode: "auto" } } : {}),
        } as any);
        if (answer) {
            client.setRequestHandler("elicitation/create" as any, async () =>
                answer === "accept"
                    ? { action: "accept", content: { confirm: true } }
                    : { action: answer },
            );
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

        it("keeps images and media when updating a post", async () => {
            const client = await connect("editor-token", "modern", "accept");
            await call(client, "save_post", {
                id: POST._id,
                version: docVersion(POST),
                showComingSoon: true,
            });
            const submitted = changeRequest.mock.calls[0][0].doc;
            expect(submitted.imageData).toEqual(POST.imageData);
            expect(submitted.showComingSoon).toBe(true);
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
