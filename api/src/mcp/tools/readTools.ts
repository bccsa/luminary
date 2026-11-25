import { McpServer } from "@modelcontextprotocol/server";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import * as z from "zod";
import { FtsSearchReqDto } from "../../dto/FtsSearchReqDto";
import { LanguageDto } from "../../dto/LanguageDto";
import { AclPermission, DocType, PublishStatus, Uuid } from "../../enums";
import { READABLE_DOC_TYPES } from "../../endpoints/readScope";
import { runFtsSearch, runQuery } from "../../endpoints/requestPipeline";
import { PermissionSystem } from "../../permissions/permissions.service";
import { clientCanElicit, defineTool, ToolEnv, ToolError, toolResult } from "../mcpContext";
import { cmsLink, decodeCursor, docTitle, docVersion, encodeCursor, trimDoc } from "../mcpDocs";
import { chunkText } from "../textPaging";

const MCP = { mcp: true };
const MAX_LIST = 50;
const API_VERSION = "0.0.0";

/** Non-Content types `list_documents` can page through, with the index each one syncs on. */
const LISTABLE_TYPES = READABLE_DOC_TYPES.filter((t) => t !== DocType.Content) as [
    DocType,
    ...DocType[],
];
/** AutoGroupMappings has no sync index; the CMS also reads it without one. */
const UNINDEXED_TYPES = new Set<DocType>([DocType.AutoGroupMappings]);

const isoDate = z.iso
    .datetime({ offset: true })
    .describe("ISO 8601 date-time, e.g. 2026-11-30T08:00:00Z");

export function languagesFor(env: ToolEnv): LanguageDto[] {
    return env.deps.queryService.readableLanguages(env.session.user, MCP);
}

/** A language by `_id` or `languageCode` (case-insensitive), among those the user can read. */
export function resolveLanguage(env: ToolEnv, value: string): LanguageDto {
    const lang = languagesFor(env).find(
        (l) => l._id === value || l.languageCode?.toLowerCase() === value.toLowerCase(),
    );
    if (!lang) throw new ToolError(`Unknown language "${value}". Use whoami to list languages.`);
    return lang;
}

function translationSummary(doc: any, languages: LanguageDto[]) {
    return {
        id: doc._id,
        language: languages.find((l) => l._id === doc.language)?.languageCode ?? doc.language,
        title: doc.title,
        status: doc.status,
        publishDate: doc.publishDate,
        expiryDate: doc.expiryDate,
        version: docVersion(doc),
    };
}

/** One page of docs ordered newest-first by `updatedTimeUtc`, resumable without skipping ties. */
async function pageByUpdatedTime(
    env: ToolEnv,
    selector: Record<string, unknown>,
    useIndex: string | undefined,
    limit: number,
    cursor: string | undefined,
): Promise<{ docs: any[]; nextCursor?: string }> {
    const after = cursor ? decodeCursor<{ ts: number; ids: Uuid[] }>(cursor) : undefined;
    const body: Record<string, unknown> = {
        selector: {
            ...selector,
            // A plain $lt would skip docs sharing the boundary timestamp (cascades produce them).
            updatedTimeUtc: after ? { $lte: after.ts } : { $gte: 0 },
        },
        sort: [{ updatedTimeUtc: "desc" }],
        limit: limit + (after?.ids.length ?? 0),
        cms: true,
        identifier: "mcp",
    };
    if (useIndex) body.use_index = useIndex;

    const { deps, session } = env;
    const result = await runQuery(
        {
            queryService: deps.queryService,
            configService: deps.configService,
            rateLimiter: deps.queryRateLimiter,
            logger: deps.logger,
        },
        body,
        session.user,
        session.identityKey,
        MCP,
    );
    const fetched = result.docs ?? [];
    const seen = new Set(after?.ids ?? []);
    const docs = fetched.filter((d: any) => !seen.has(d._id)).slice(0, limit);

    if (fetched.length < (body.limit as number) || docs.length === 0) return { docs };
    const last = docs[docs.length - 1].updatedTimeUtc;
    const ids = docs.filter((d: any) => d.updatedTimeUtc === last).map((d: any) => d._id);
    if (after && after.ts === last) ids.push(...after.ids);
    return { docs, nextCursor: encodeCursor({ ts: last, ids }) };
}

export function registerReadTools(server: McpServer, env: ToolEnv): void {
    const { session, deps } = env;
    const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

    defineTool(
        server,
        env,
        "whoami",
        {
            title: "Who am I",
            description:
                "Your Luminary user, what you can read through MCP, where you can create posts and tags, which languages you can translate into, and whether this app can confirm changes to live content. Call this first.",
            inputSchema: z.object({}).strict(),
            annotations: readOnly,
        },
        async (_args, ctx) => {
            const { user } = session;
            const groupsFor = (permission: AclPermission, types: DocType[]) =>
                PermissionSystem.accessMapToGroups(user.accessMap, permission, types) as any;

            const mcp = groupsFor(AclPermission.McpView, READABLE_DOC_TYPES);
            const edit = groupsFor(AclPermission.Edit, [DocType.Post, DocType.Tag]);
            const assign = groupsFor(AclPermission.Assign, [DocType.Group])[DocType.Group] || [];
            const translate =
                groupsFor(AclPermission.Translate, [DocType.Language])[DocType.Language] || [];
            const publish = groupsFor(AclPermission.Publish, [DocType.Post, DocType.Tag]);
            const createIn = (type: DocType): Uuid[] =>
                (edit[type] || []).filter(
                    (g: Uuid) => assign.includes(g) && (mcp[type] || []).includes(g),
                );

            const languages = languagesFor(env);
            const groupIds = [
                ...new Set([...user.groups, ...createIn(DocType.Post), ...createIn(DocType.Tag)]),
            ];
            const groupDocs = await deps.queryService.getReadableDocs(groupIds, user, MCP);
            const named = (ids: Uuid[]) =>
                ids.map((id) => ({ id, name: groupDocs.find((g) => g._id === id)?.name }));

            const warnings: string[] = [];
            if (!languages.length)
                warnings.push("You have McpView on no Language, so you can't read any content.");
            if (!user.userId)
                warnings.push(
                    "Your login isn't linked to a Luminary user: you can read, but writes are refused.",
                );

            return toolResult({
                user: { userId: user.userId, name: user.name, email: user.email },
                groups: named(user.groups),
                mcpAccess: Object.fromEntries(
                    Object.entries(mcp).filter(([, ids]) => (ids as Uuid[]).length),
                ),
                createPostsIn: named(createIn(DocType.Post)),
                createTagsIn: named(createIn(DocType.Tag)),
                canPublish: {
                    post: (publish[DocType.Post] || []).length > 0,
                    tag: (publish[DocType.Tag] || []).length > 0,
                },
                languages: languages.map((l) => ({
                    id: l._id,
                    code: l.languageCode,
                    name: l.name,
                    default: l.default === 1,
                    canTranslate: (l.memberOf as Uuid[]).some((g) => translate.includes(g)),
                })),
                canConfirmLiveChanges: clientCanElicit(ctx) && !!deps.confirmCodec,
                warnings,
            });
        },
    );

    defineTool(
        server,
        env,
        "search",
        {
            title: "Search",
            description:
                "Full-text search. By default searches post and tag translations (drafts included); set type to search users or redirects instead. Returns ids for fetch.",
            inputSchema: z
                .object({
                    query: z.string().min(1).max(256),
                    type: z.enum(["content", "user", "redirect"]).optional(),
                    language: z.string().optional().describe("Language code or id (content only)"),
                    status: z.enum([PublishStatus.Draft, PublishStatus.Published]).optional(),
                    tags: z.array(z.string()).max(20).optional().describe("Tag ids (content only)"),
                    publishedAfter: isoDate.optional(),
                    publishedBefore: isoDate.optional(),
                    limit: z.number().int().min(1).max(50).optional(),
                    offset: z.number().int().min(0).max(450).optional(),
                })
                .strict(),
            annotations: readOnly,
        },
        async (args) => {
            const type = args.type ?? "content";
            const languages = languagesFor(env);
            const req: Record<string, unknown> = {
                apiVersion: API_VERSION,
                queryString: args.query,
                cms: true,
                limit: args.limit ?? 10,
                offset: args.offset ?? 0,
                types:
                    type === "content"
                        ? [DocType.Post, DocType.Tag]
                        : [type === "user" ? DocType.User : DocType.Redirect],
            };
            if (type === "content") {
                if (args.language) req.languages = [resolveLanguage(env, args.language)._id];
                if (args.status) req.status = args.status;
                if (args.tags?.length) req.tags = args.tags;
                if (args.publishedAfter) req.publishedAfter = Date.parse(args.publishedAfter);
                if (args.publishedBefore) req.publishedBefore = Date.parse(args.publishedBefore);
            }

            // REST validates this DTO in the global ValidationPipe; a direct call must do it itself.
            const dto = plainToInstance(FtsSearchReqDto, req);
            const errors = await validate(dto);
            if (errors.length) throw new ToolError(`Invalid search: ${errors[0].toString()}`);

            const results = await runFtsSearch(
                {
                    ftsSearchService: deps.ftsSearchService,
                    rateLimiter: deps.queryRateLimiter,
                    logger: deps.logger,
                },
                dto,
                session.user,
                session.identityKey,
                MCP,
            );

            return toolResult({
                results: results.map((r) => {
                    const doc: any = r.doc;
                    return {
                        id: r.docId,
                        title: docTitle(doc),
                        url: cmsLink(doc, session.settings.cmsUrl, languages),
                        type: doc.type,
                        ...(doc.type === DocType.Content
                            ? {
                                  parentId: doc.parentId,
                                  language:
                                      languages.find((l) => l._id === doc.language)?.languageCode ??
                                      doc.language,
                                  status: doc.status,
                              }
                            : {}),
                    };
                }),
            });
        },
    );

    defineTool(
        server,
        env,
        "fetch",
        {
            title: "Fetch a document",
            description:
                "One document by id. For a translation, text is its HTML body (paginated when long: continue with fetch_text). For a post or tag, metadata.translations lists its translations. metadata.version is needed to update the document.",
            inputSchema: z.object({ id: z.string().min(1) }).strict(),
            annotations: readOnly,
        },
        async ({ id }) => {
            const [doc] = await deps.queryService.getReadableDocs([id], session.user, MCP);
            if (!doc) throw new ToolError("No document with that id, or you have no access to it");
            const languages = languagesFor(env);
            const url = cmsLink(doc, session.settings.cmsUrl, languages);

            if (doc.type === DocType.Content) {
                const chunks = chunkText(doc.text);
                const version = docVersion(doc);
                return toolResult({
                    id,
                    title: docTitle(doc),
                    text: chunks[0],
                    url,
                    metadata: {
                        ...trimDoc(doc),
                        languageCode: languages.find((l) => l._id === doc.language)?.languageCode,
                        ...(chunks.length > 1
                            ? {
                                  textPage: {
                                      index: 0,
                                      count: chunks.length,
                                      nextCursor: encodeCursor({ id, version, index: 1 }),
                                  },
                              }
                            : {}),
                    },
                });
            }

            if (doc.type === DocType.Post || doc.type === DocType.Tag) {
                const translations = await deps.queryService.getReadableContentByParent(
                    [id],
                    session.user,
                    MCP,
                );
                const defaultFirst = [...translations].sort(
                    (a, b) =>
                        Number(languages.find((l) => l._id === b.language)?.default === 1) -
                        Number(languages.find((l) => l._id === a.language)?.default === 1),
                );
                const metadata = trimDoc(doc);
                return toolResult({
                    id,
                    title: docTitle(doc, defaultFirst),
                    text: JSON.stringify(metadata),
                    url,
                    metadata: {
                        ...metadata,
                        translations: defaultFirst.map((t) => translationSummary(t, languages)),
                    },
                });
            }

            const metadata = trimDoc(doc, { keepTranslations: true });
            return toolResult({
                id,
                title: docTitle(doc),
                text: JSON.stringify(metadata),
                url,
                metadata,
            });
        },
    );

    defineTool(
        server,
        env,
        "fetch_text",
        {
            title: "Fetch more of a long text",
            description:
                "The next part of a translation's long HTML body, using textPage.nextCursor from fetch (or from a previous fetch_text).",
            inputSchema: z.object({ id: z.string().min(1), cursor: z.string().min(1) }).strict(),
            annotations: readOnly,
        },
        async ({ id, cursor }) => {
            const page = decodeCursor<{ id: string; version: string; index: number }>(cursor);
            if (page.id !== id) throw new ToolError("That cursor belongs to another document");

            const [doc] = await deps.queryService.getReadableDocs([id], session.user, MCP);
            if (!doc || doc.type !== DocType.Content)
                throw new ToolError("No translation with that id, or you have no access to it");
            if (docVersion(doc) !== page.version)
                throw new ToolError("The text changed since it was fetched; fetch it again");

            const chunks = chunkText(doc.text);
            if (!Number.isInteger(page.index) || page.index < 0 || page.index >= chunks.length)
                throw new ToolError("That cursor is past the end of the text");
            const next = page.index + 1;
            return toolResult({
                id,
                index: page.index,
                count: chunks.length,
                text: chunks[page.index],
                ...(next < chunks.length
                    ? { nextCursor: encodeCursor({ id, version: page.version, index: next }) }
                    : {}),
            });
        },
    );

    defineTool(
        server,
        env,
        "list_content",
        {
            title: "List posts or tags",
            description:
                "Translations of posts or tags, newest change first, grouped by their post or tag. Drafts included. Page on with nextCursor.",
            inputSchema: z
                .object({
                    parentType: z.enum([DocType.Post, DocType.Tag]),
                    subtype: z
                        .string()
                        .optional()
                        .describe("Post type (e.g. blog, page) or tag type (e.g. category, topic)"),
                    language: z.string().optional().describe("Language code or id"),
                    limit: z.number().int().min(1).max(MAX_LIST).optional(),
                    cursor: z.string().optional(),
                })
                .strict(),
            annotations: readOnly,
        },
        async (args) => {
            const languages = languagesFor(env);
            const selector: Record<string, unknown> = {
                type: DocType.Content,
                parentType: args.parentType,
            };
            if (args.subtype)
                selector[args.parentType === DocType.Post ? "parentPostType" : "parentTagType"] =
                    args.subtype;
            if (args.language) selector.language = resolveLanguage(env, args.language)._id;

            const { docs, nextCursor } = await pageByUpdatedTime(
                env,
                selector,
                `sync-${args.parentType}-content-index`,
                args.limit ?? 20,
                args.cursor,
            );

            const byParent = new Map<string, any>();
            for (const doc of docs) {
                const item = byParent.get(doc.parentId) ?? {
                    id: doc.parentId,
                    type: doc.parentType,
                    subtype: doc.parentPostType ?? doc.parentTagType,
                    url: cmsLink(
                        {
                            type: doc.parentType,
                            _id: doc.parentId,
                            postType: doc.parentPostType,
                            tagType: doc.parentTagType,
                        },
                        session.settings.cmsUrl,
                        languages,
                    ),
                    translations: [],
                };
                item.translations.push(translationSummary(doc, languages));
                byParent.set(doc.parentId, item);
            }
            return toolResult({
                items: [...byParent.values()],
                ...(nextCursor ? { nextCursor } : {}),
            });
        },
    );

    defineTool(
        server,
        env,
        "list_documents",
        {
            title: "List documents of a type",
            description:
                "Documents of one type (not translations: use list_content for those), newest change first. Page on with nextCursor.",
            inputSchema: z
                .object({
                    docType: z.enum(LISTABLE_TYPES),
                    limit: z.number().int().min(1).max(MAX_LIST).optional(),
                    cursor: z.string().optional(),
                })
                .strict(),
            annotations: readOnly,
        },
        async (args) => {
            const languages = languagesFor(env);
            const limit = args.limit ?? 20;
            let docs: any[];
            let nextCursor: string | undefined;

            if (UNINDEXED_TYPES.has(args.docType)) {
                const result = await runQuery(
                    {
                        queryService: deps.queryService,
                        configService: deps.configService,
                        rateLimiter: deps.queryRateLimiter,
                        logger: deps.logger,
                    },
                    {
                        selector: { type: args.docType },
                        limit: MAX_LIST,
                        cms: true,
                        identifier: "mcp",
                    },
                    session.user,
                    session.identityKey,
                    MCP,
                );
                docs = (result.docs ?? []).slice(0, limit);
            } else {
                ({ docs, nextCursor } = await pageByUpdatedTime(
                    env,
                    { type: args.docType },
                    `sync-${args.docType}-index`,
                    limit,
                    args.cursor,
                ));
            }

            return toolResult({
                items: docs.map((doc) => ({
                    id: doc._id,
                    title: docTitle(doc),
                    url: cmsLink(doc, session.settings.cmsUrl, languages),
                    doc: trimDoc(doc),
                })),
                ...(nextCursor ? { nextCursor } : {}),
            });
        },
    );
}
