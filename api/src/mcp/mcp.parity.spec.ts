import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createTestingModule } from "../test/testingModule";
import { DbService } from "../db/db.service";
import configuration from "../configuration";
import { QueryService } from "../endpoints/query.service";
import { FtsSearchService } from "../endpoints/ftsSearch.service";
import { ChangeRequestService } from "../endpoints/changeRequest.service";
import { QueryRateLimiterService } from "../ratelimit/queryRateLimiter.service";
import { ChangeRequestRateLimiterService } from "../ratelimit/changeRequestRateLimiter.service";
import { McpRateLimiterService } from "../ratelimit/mcpRateLimiter.service";
import { PermissionSystem } from "../permissions/permissions.service";
import { AckStatus, DocType } from "../enums";
import { McpService } from "./mcp.service";
import { McpSession } from "./mcpContext";
import { hasMcpAccess } from "./mcpAuth";
import { docVersion } from "./mcpDocs";

/**
 * Parity of MCP reads and writes with the CMS rules, on the seeded CouchDB data (needs CouchDB):
 * editor1 has McpView on public content and languages, editor2 has CMS access only.
 */
describe("MCP permission parity (seeded data)", () => {
    let db: DbService;
    let queryService: QueryService;
    let changeRequestService: ChangeRequestService;
    let mcp: McpService;
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;

    beforeAll(async () => {
        process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "test-encryption-key-for-parity";
        db = (await createTestingModule("mcp-parity")).dbService;
        const config = new ConfigService(configuration());
        queryService = new QueryService(logger, db);
        changeRequestService = new ChangeRequestService(db, { invalidate: jest.fn() } as any);
        mcp = new McpService(
            queryService,
            new FtsSearchService(logger, db),
            changeRequestService,
            config,
            new QueryRateLimiterService(config),
            new ChangeRequestRateLimiterService(config),
            new McpRateLimiterService(config),
            db,
            logger,
        );
        // Let the services load their language caches.
        await new Promise((resolve) => setTimeout(resolve, 500));
    });

    async function sessionFor(userDocId: string): Promise<McpSession> {
        const userDoc = (await db.getDoc(userDocId)).docs[0] as any;
        const groups = userDoc.memberOf as string[];
        return {
            user: {
                groups,
                userId: userDoc._id,
                name: userDoc.name,
                email: userDoc.email,
                accessMap: PermissionSystem.getAccessMap(groups),
                jwtPayload: { sub: userDoc._id },
            },
            providerId: "provider-test",
            settings: { resourceUrl: "http://localhost/mcp/provider-test", allowedClientIds: [] },
            identityKey: userDoc._id,
        };
    }

    async function connect(session: McpSession) {
        const client = new Client({ name: "parity", version: "0.0.0" }, {
            versionNegotiation: { mode: "auto" },
        } as any);
        await client.connect(
            new StreamableHTTPClientTransport(new URL(session.settings.resourceUrl), {
                fetch: (url: any, init: any) =>
                    mcp.fetch(new Request(url, init), session, undefined),
            } as any),
        );
        return client;
    }

    const ids = (docs: any[]) => docs.map((d) => d._id).sort();

    it("gives editor1 MCP access and editor2 none", async () => {
        expect(hasMcpAccess((await sessionFor("user-editor1")).user.accessMap)).toBe(true);
        expect(hasMcpAccess((await sessionFor("user-editor2")).user.accessMap)).toBe(false);
    });

    it.each([DocType.Post, DocType.Tag])(
        "returns the same %s translations from the Mango query, the predicate and list_content",
        async (parentType) => {
            const session = await sessionFor("user-editor1");

            const mango = await queryService.query(
                {
                    selector: { type: DocType.Content, parentType },
                    limit: 500,
                    cms: true,
                } as any,
                session.user,
                { mcp: true },
            );
            const all = (await db.executeFindQuery({
                selector: { type: DocType.Content, parentType },
                limit: 500,
            })) as any;
            const predicate = queryService.filterReadable(all.docs, session.user, { mcp: true });

            const client = await connect(session);
            const listed = (await client.callTool({
                name: "list_content",
                arguments: { parentType, limit: 50 },
            })) as any;
            const toolIds = listed.structuredContent.items
                .flatMap((item: any) => item.translations.map((t: any) => t.id))
                .sort();
            await client.close();

            expect(ids(mango.docs).length).toBeGreaterThan(0);
            expect(ids(predicate)).toEqual(ids(mango.docs));
            expect(toolIds).toEqual(ids(mango.docs));
            // CMS access to private content doesn't extend to MCP.
            expect(ids(mango.docs).some((id) => id.includes("2"))).toBe(false);
        },
    );

    it("lets fetch read public content but not private content", async () => {
        const client = await connect(await sessionFor("user-editor1"));
        const pub = (await client.callTool({
            name: "fetch",
            arguments: { id: "content-blog1-eng" },
        })) as any;
        const priv = (await client.callTool({
            name: "fetch",
            arguments: { id: "content-blog2-eng" },
        })) as any;
        await client.close();

        expect(pub.isError).toBeFalsy();
        expect(priv.isError).toBe(true);
    });

    it("refuses MCP queries for a user without McpView", async () => {
        const session = await sessionFor("user-editor2");
        await expect(
            queryService.query(
                { selector: { type: DocType.Post }, cms: true } as any,
                session.user,
                { mcp: true },
            ),
        ).rejects.toThrow("Forbidden");
    });

    it("applies a confirmed edit that a change request would also accept", async () => {
        const session = await sessionFor("user-editor1");
        const stored = (await db.getDoc("content-blog1-eng")).docs[0] as any;

        const client = new Client({ name: "parity", version: "0.0.0" }, {
            versionNegotiation: { mode: "auto" },
            capabilities: { elicitation: {} },
        } as any);
        client.setRequestHandler("elicitation/create" as any, async () => ({
            action: "accept",
            content: { confirm: true },
        }));
        await client.connect(
            new StreamableHTTPClientTransport(new URL(session.settings.resourceUrl), {
                fetch: (url: any, init: any) =>
                    mcp.fetch(new Request(url, init), session, undefined),
            } as any),
        );
        const res = (await client.callTool({
            name: "save_translation",
            arguments: { id: stored._id, version: docVersion(stored), title: "Parity title" },
        })) as any;
        await client.close();

        expect(res.structuredContent?.status).toBe("applied");
        const saved = (await db.getDoc(stored._id)).docs[0] as any;
        expect(saved.title).toBe("Parity title");

        const direct = await changeRequestService.changeRequest(
            { doc: { ...saved, title: "Parity title 2" } } as any,
            session.user,
        );
        expect(direct.ack).toBe(AckStatus.Accepted);
    });

    it("refuses an MCP write where the user has CMS but not MCP access", async () => {
        const session = await sessionFor("user-editor1");
        const stored = (await db.getDoc("content-blog2-eng")).docs[0] as any;
        const client = await connect(session);
        const res = (await client.callTool({
            name: "save_translation",
            arguments: { id: stored._id, version: docVersion(stored), title: "Changed" },
        })) as any;
        await client.close();

        expect(res.isError).toBe(true);
        expect((await db.getDoc(stored._id)).docs[0]).toMatchObject({ title: stored.title });
    });
});
