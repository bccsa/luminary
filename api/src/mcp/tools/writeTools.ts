import { randomUUID } from "crypto";
import { McpServer, type ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod";
import { AckStatus, DocType, PostType, PublishStatus, RedirectType, TagType } from "../../enums";
import { admitChangeRequest, submitChangeRequest } from "../../endpoints/requestPipeline";
import { generateNonUniqueSlug } from "../../util/slug";
import { confirmLiveChange, pendingConfirmation } from "../confirmLiveChange";
import { defineTool, ToolEnv, ToolError, toolResult } from "../mcpContext";
import { docTitle, docVersion, hashJson, trimDoc } from "../mcpDocs";
import { chunkText, spliceChunks } from "../textPaging";
import { languagesFor, resolveLanguage } from "./readTools";

const MCP = { mcp: true };
const API_VERSION = "0.0.0";
const ALLOWED_HTML =
    "HTML using only these tags: p, br, h1–h6, ul, ol, li, strong, em, u, s, code, pre, blockquote, hr, a (href, target).";

const isoDate = z.iso
    .datetime({ offset: true })
    .describe("ISO 8601 date-time, e.g. 2026-11-30T08:00:00Z");
const groupIds = z.array(z.string().min(1)).min(1).max(20);

type WriteOptions = {
    tool: string;
    args: Record<string, unknown>;
    doc: Record<string, any>;
    stored?: Record<string, any>;
    live: boolean;
    describe: () => string;
};

/** A doc to update: it must exist with one of these types and be readable through MCP. */
async function loadForUpdate(
    env: ToolEnv,
    id: string,
    types: DocType[],
    version: string | undefined,
) {
    const stored = (await env.deps.db.getDoc(id)).docs?.[0] as any;
    const readable =
        stored && types.includes(stored.type)
            ? env.deps.queryService.filterReadable([stored], env.session.user, MCP)
            : [];
    if (!readable.length)
        throw new ToolError("No document of that kind with that id, or you have no access to it");
    if (!version) throw new ToolError("version is required: fetch the document first");

    const current = docVersion(stored);
    if (version !== current) {
        const fits = stored.type !== DocType.Content || chunkText(stored.text).length === 1;
        throw new ToolError(
            "The document changed since you fetched it, so nothing was changed. Re-apply your change to this version.",
            { conflict: true, version: current, doc: trimDoc(stored, { keepText: fits }) },
        );
    }
    return stored;
}

/** A new doc must be readable through MCP once saved, so the writer can't create blind. */
function assertCreatesReadable(env: ToolEnv, doc: Record<string, any>) {
    if (!env.deps.queryService.filterReadable([doc], env.session.user, MCP).length)
        throw new ToolError(
            "You have no MCP access to the groups in memberOf for this document type",
        );
}

async function assertNewId(env: ToolEnv, id: string) {
    if ((await env.deps.db.getDoc(id)).docs?.length)
        throw new ToolError("This document was already created");
}

/** The id a create uses: carried through a live-change confirmation so both calls agree. */
function newDocId(ctx: ServerContext, tool: string): string {
    const pending = pendingConfirmation(ctx);
    return pending?.tool === tool && pending.version === null ? pending.docId : randomUUID();
}

function changedFields(
    before: Record<string, any> | undefined,
    after: Record<string, any>,
    fields: string[],
) {
    return fields.filter((f) => JSON.stringify(before?.[f]) !== JSON.stringify(after[f]));
}

/** Confirm (when live), submit through the change-request pipeline, audit, and read back. */
async function applyWrite(env: ToolEnv, ctx: ServerContext, options: WriteOptions) {
    const { session, deps } = env;
    if (!session.user.userId)
        throw new ToolError(
            "Your login isn't linked to a Luminary user, so you can't make changes through MCP",
        );

    let confirmed = false;
    if (options.live) {
        const outcome = await confirmLiveChange(env, ctx, {
            tool: options.tool,
            docId: options.doc._id,
            version: options.stored ? docVersion(options.stored) : null,
            changeHash: hashJson(options.args),
            message: options.describe(),
        });
        if ("result" in outcome) return outcome.result;
        confirmed = true;
    }

    const pipeline = {
        changeRequestService: deps.changeRequestService,
        rateLimiter: deps.changeRequestRateLimiter,
    };
    admitChangeRequest(pipeline, session.user, session.identityKey);
    const ack = await submitChangeRequest(
        pipeline,
        { apiVersion: API_VERSION, doc: options.doc },
        session.user,
    );

    deps.logger.info("MCP write", {
        userId: session.user.userId,
        providerId: session.providerId,
        clientId: session.clientId,
        tool: options.tool,
        docId: options.doc._id,
        docType: options.doc.type,
        ack: ack.ack,
        confirmed,
    });

    // Only the ack's status and messages are returned; the saved doc is read back below.
    if (ack.ack !== AckStatus.Accepted)
        throw new ToolError(`Rejected: ${ack.message ?? "the change was not accepted"}`);

    const saved = (await deps.db.getDoc(options.doc._id)).docs?.[0];
    return toolResult({
        status: "applied",
        id: options.doc._id,
        version: docVersion(saved),
        doc: saved ? trimDoc(saved) : undefined,
        ...(ack.warnings?.length ? { warnings: ack.warnings } : {}),
        ...(ack.info?.length ? { info: ack.info } : {}),
    });
}

/** Flags the CMS omits when false (or at their default), so MCP-written docs look the same. */
function setFlag(doc: Record<string, any>, field: string, value: boolean | undefined) {
    if (value === undefined) return;
    if (value) doc[field] = true;
    else delete doc[field];
}

function registerParentTool(server: McpServer, env: ToolEnv, type: DocType.Post | DocType.Tag) {
    const isPost = type === DocType.Post;
    const subtypeField = isPost ? "postType" : "tagType";
    const tool = isPost ? "save_post" : "save_tag";
    const editable = [
        "memberOf",
        "tags",
        "publishDateVisible",
        "showComingSoon",
        "alwaysOffline",
        "useVerticalTileLayout",
        "authorType",
        ...(isPost ? [] : ["pinned"]),
    ];

    const schema = z
        .object({
            id: z.string().optional().describe(`Omit to create a new ${type}`),
            version: z.string().optional().describe("Required when updating: from fetch"),
            [subtypeField]: z
                .enum(isPost ? Object.values(PostType) : Object.values(TagType))
                .optional()
                .describe("Required when creating; can't be changed afterwards"),
            memberOf: groupIds
                .optional()
                .describe("Group ids; required when creating (see whoami)"),
            tags: z.array(z.string().min(1)).max(100).optional().describe("Tag ids"),
            publishDateVisible: z.boolean().optional(),
            showComingSoon: z.boolean().optional(),
            alwaysOffline: z.boolean().optional(),
            useVerticalTileLayout: z.boolean().optional(),
            authorType: z.enum(["person", "org"]).optional(),
            ...(isPost ? {} : { pinned: z.boolean().optional() }),
        })
        .strict();

    defineTool(
        server,
        env,
        tool,
        {
            title: isPost ? "Create or update a post" : "Create or update a tag",
            description: `Creates a ${type} (omit id) or updates its settings. Text lives in translations: create the ${type} first, then add translations with save_translation. Images and media can't be changed through MCP. Changing a ${type} with published translations asks the user to confirm.`,
            inputSchema: schema,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args: any, ctx) => {
            const stored = args.id
                ? await loadForUpdate(env, args.id, [type], args.version)
                : undefined;
            if (stored && args[subtypeField] && args[subtypeField] !== stored[subtypeField])
                throw new ToolError(`${subtypeField} can't be changed after creation`);

            let doc: Record<string, any>;
            if (stored) {
                doc = { ...stored };
            } else {
                if (!args[subtypeField] || !args.memberOf)
                    throw new ToolError(
                        `${subtypeField} and memberOf are required to create a ${type}`,
                    );
                // The CMS's defaults for a new post/tag (useEditContentSource).
                doc = {
                    _id: newDocId(ctx, tool),
                    type,
                    updatedTimeUtc: 0,
                    memberOf: [],
                    tags: [],
                    publishDateVisible: isPost,
                    linkDates: true,
                    [subtypeField]: args[subtypeField],
                    ...(isPost ? {} : { pinned: 0 }),
                };
                await assertNewId(env, doc._id);
            }

            if (args.memberOf) doc.memberOf = args.memberOf;
            if (args.tags) {
                const found = (await env.deps.db.getDocs(args.tags, [DocType.Tag])).docs ?? [];
                const missing = args.tags.filter(
                    (id: string) => !found.some((t: any) => t._id === id),
                );
                if (missing.length) throw new ToolError(`Unknown tag ids: ${missing.join(", ")}`);
                doc.tags = args.tags;
            }
            if (args.publishDateVisible !== undefined)
                doc.publishDateVisible = args.publishDateVisible;
            setFlag(doc, "showComingSoon", args.showComingSoon);
            setFlag(doc, "alwaysOffline", args.alwaysOffline);
            setFlag(doc, "useVerticalTileLayout", args.useVerticalTileLayout);
            if (args.authorType === "org") doc.authorType = "org";
            else if (args.authorType === "person") delete doc.authorType;
            if (!isPost && args.pinned !== undefined) doc.pinned = args.pinned ? 1 : 0;

            if (!stored) assertCreatesReadable(env, doc);

            const translations = stored
                ? ((await env.deps.db.getContentByParentId(stored._id)).docs ?? [])
                : [];
            const published = translations.filter((t: any) => t.status === PublishStatus.Published);

            return applyWrite(env, ctx, {
                tool,
                args,
                doc,
                stored,
                live: published.length > 0,
                describe: () =>
                    `Change the ${type} "${docTitle(stored, translations)}", which has ${published.length} published translation(s). ` +
                    `Changes: ${changedFields(stored, doc, editable).join(", ") || "none"}.`,
            });
        },
    );
}

export function registerWriteTools(server: McpServer, env: ToolEnv): void {
    registerParentTool(server, env, DocType.Post);
    registerParentTool(server, env, DocType.Tag);

    const translationFields = [
        "title",
        "summary",
        "author",
        "slug",
        "seoTitle",
        "seoString",
        "text",
    ];

    defineTool(
        server,
        env,
        "save_translation",
        {
            title: "Create or update a translation",
            description:
                `Creates a translation of a post or tag (omit id; give parentId, language and title) as a draft, or updates one. text is ${ALLOWED_HTML} ` +
                "When fetch paginated the text (textPage), change it with textChunks instead of text. Publishing is done with set_publish_status. " +
                "Changing a published translation asks the user to confirm.",
            inputSchema: z
                .object({
                    id: z.string().optional().describe("Omit to create a new translation"),
                    version: z.string().optional().describe("Required when updating: from fetch"),
                    parentId: z
                        .string()
                        .optional()
                        .describe("Post or tag id; required when creating"),
                    language: z
                        .string()
                        .optional()
                        .describe("Language code or id; required when creating"),
                    title: z.string().max(500).optional(),
                    summary: z.string().max(5000).optional(),
                    author: z.string().max(500).optional(),
                    slug: z
                        .string()
                        .max(500)
                        .optional()
                        .describe("Generated from the title when creating"),
                    seoTitle: z.string().max(500).optional(),
                    seoString: z.string().max(5000).optional(),
                    text: z.string().max(900_000).optional(),
                    textChunks: z
                        .array(
                            z.object({ index: z.number().int().min(0), html: z.string() }).strict(),
                        )
                        .min(1)
                        .max(50)
                        .optional(),
                })
                .strict(),
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        async (args, ctx) => {
            if (args.text !== undefined && args.textChunks)
                throw new ToolError("Give either text or textChunks, not both");
            if (args.title !== undefined && !args.title.trim())
                throw new ToolError("title can't be empty");
            const languages = languagesFor(env);

            if (!args.id) {
                if (!args.parentId || !args.language || !args.title)
                    throw new ToolError(
                        "parentId, language and title are required to create a translation",
                    );
                if (args.textChunks) throw new ToolError("Use text, not textChunks, when creating");

                const parent = (await env.deps.db.getDoc(args.parentId)).docs?.[0] as any;
                if (
                    !parent ||
                    (parent.type !== DocType.Post && parent.type !== DocType.Tag) ||
                    !env.deps.queryService.filterReadable([parent], env.session.user, MCP).length
                )
                    throw new ToolError(
                        "No post or tag with that parentId, or you have no access to it",
                    );
                const language = resolveLanguage(env, args.language);
                const siblings = (await env.deps.db.getContentByParentId(parent._id)).docs ?? [];
                if (siblings.some((s: any) => s.language === language._id))
                    throw new ToolError(
                        `This ${parent.type} already has a ${language.name} translation`,
                    );

                const id = randomUUID();
                // The CMS's shape for a new translation (EditContent.vue createTranslation).
                const doc: Record<string, any> = {
                    _id: id,
                    type: DocType.Content,
                    updatedTimeUtc: Date.now(),
                    memberOf: [],
                    parentId: parent._id,
                    parentType: parent.type,
                    language: language._id,
                    status: PublishStatus.Draft,
                    title: args.title,
                    slug:
                        args.slug ||
                        generateNonUniqueSlug(args.title) ||
                        `untitled-${id.slice(0, 8)}`,
                    parentTags: [],
                };
                for (const field of ["summary", "author", "seoTitle", "seoString", "text"])
                    if ((args as any)[field] !== undefined) doc[field] = (args as any)[field];

                return applyWrite(env, ctx, {
                    tool: "save_translation",
                    args,
                    doc,
                    live: false,
                    describe: () => "",
                });
            }

            if (args.parentId || args.language)
                throw new ToolError(
                    "parentId and language can't be changed on an existing translation",
                );
            const stored = await loadForUpdate(env, args.id, [DocType.Content], args.version);
            const doc: Record<string, any> = { ...stored };
            for (const field of ["title", "summary", "author", "slug", "seoTitle", "seoString"])
                if ((args as any)[field] !== undefined) doc[field] = (args as any)[field];

            const paginated = chunkText(stored.text).length > 1;
            if (args.text !== undefined) {
                if (paginated)
                    throw new ToolError(
                        "This text is long and was paginated: change it with textChunks (indexes from fetch / fetch_text)",
                    );
                doc.text = args.text;
            }
            if (args.textChunks) {
                try {
                    doc.text = spliceChunks(stored.text, args.textChunks);
                } catch (err) {
                    throw new ToolError(err.message);
                }
            }

            const language = languages.find((l) => l._id === stored.language);
            const changes = changedFields(stored, doc, translationFields);
            return applyWrite(env, ctx, {
                tool: "save_translation",
                args,
                doc,
                stored,
                live: stored.status === PublishStatus.Published,
                describe: () =>
                    `Edit the published ${language?.name ?? stored.language} translation "${stored.title}". ` +
                    `Changes: ${changes.join(", ") || "none"}.` +
                    (doc.slug !== stored.slug
                        ? ` The URL changes from /${stored.slug} to /${doc.slug}; the old one will redirect.`
                        : ""),
            });
        },
    );

    defineTool(
        server,
        env,
        "set_publish_status",
        {
            title: "Publish or unpublish a translation",
            description:
                "Publishes, schedules (a future publishDate) or unpublishes a translation, and sets its expiry. Always asks the user to confirm. Needs Publish permission.",
            inputSchema: z
                .object({
                    id: z.string().min(1),
                    version: z.string().min(1),
                    status: z.enum([PublishStatus.Draft, PublishStatus.Published]),
                    publishDate: isoDate.optional().describe("Defaults to the current one, or now"),
                    expiryDate: isoDate.nullable().optional().describe("null removes the expiry"),
                })
                .strict(),
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        async (args, ctx) => {
            const stored = await loadForUpdate(env, args.id, [DocType.Content], args.version);
            const doc: Record<string, any> = { ...stored, status: args.status };
            if (args.publishDate) doc.publishDate = Date.parse(args.publishDate);
            else if (!doc.publishDate && args.status === PublishStatus.Published)
                doc.publishDate = Date.now();
            if (args.expiryDate === null) delete doc.expiryDate;
            else if (args.expiryDate) doc.expiryDate = Date.parse(args.expiryDate);
            if (doc.expiryDate && doc.publishDate && doc.expiryDate <= doc.publishDate)
                throw new ToolError("expiryDate must be after publishDate");

            const parent = (await env.deps.db.getDoc(stored.parentId)).docs?.[0] as any;
            const siblings = parent?.linkDates
                ? ((await env.deps.db.getContentByParentId(stored.parentId)).docs ?? []).filter(
                      (s: any) => s._id !== stored._id,
                  )
                : [];
            const language = languagesFor(env).find((l) => l._id === stored.language);
            const when = (ms?: number) => (ms ? new Date(ms).toISOString() : "none");

            return applyWrite(env, ctx, {
                tool: "set_publish_status",
                args,
                doc,
                stored,
                live: true,
                describe: () =>
                    `${args.status === PublishStatus.Published ? "Publish" : "Unpublish"} the ${language?.name ?? stored.language} translation "${stored.title}" ` +
                    `(now ${stored.status}). Publish date: ${when(doc.publishDate)}. Expiry: ${when(doc.expiryDate)}.` +
                    (siblings.length
                        ? ` Its dates are linked, so ${siblings.length} other translation(s) get the same dates.`
                        : ""),
            });
        },
    );

    defineTool(
        server,
        env,
        "save_redirect",
        {
            title: "Create or update a redirect",
            description:
                "Creates (omit id) or updates a redirect from one slug to another. Redirects are live immediately, so this always asks the user to confirm.",
            inputSchema: z
                .object({
                    id: z.string().optional(),
                    version: z.string().optional(),
                    redirectType: z
                        .enum(Object.values(RedirectType) as [string, ...string[]])
                        .optional(),
                    slug: z.string().min(1).max(500).optional(),
                    toSlug: z.string().max(500).optional(),
                    memberOf: groupIds.optional(),
                })
                .strict(),
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        async (args, ctx) => {
            const stored = args.id
                ? await loadForUpdate(env, args.id, [DocType.Redirect], args.version)
                : undefined;
            let doc: Record<string, any>;
            if (stored) {
                doc = { ...stored };
            } else {
                if (!args.redirectType || !args.slug || !args.memberOf)
                    throw new ToolError(
                        "redirectType, slug and memberOf are required to create a redirect",
                    );
                doc = { _id: newDocId(ctx, "save_redirect"), type: DocType.Redirect, memberOf: [] };
                await assertNewId(env, doc._id);
            }
            for (const field of ["redirectType", "slug", "toSlug", "memberOf"])
                if ((args as any)[field] !== undefined) doc[field] = (args as any)[field];
            if (!stored) assertCreatesReadable(env, doc);

            return applyWrite(env, ctx, {
                tool: "save_redirect",
                args,
                doc,
                stored,
                live: true,
                describe: () =>
                    `${stored ? "Change" : "Create"} the ${doc.redirectType} redirect from /${doc.slug} to /${doc.toSlug ?? ""}` +
                    (stored && (stored.slug !== doc.slug || stored.toSlug !== doc.toSlug)
                        ? ` (was /${stored.slug} to /${stored.toSlug ?? ""})`
                        : "") +
                    ".",
            });
        },
    );

    defineTool(
        server,
        env,
        "save_language",
        {
            title: "Create or update a language",
            description:
                "Creates (omit id) or updates a language and its app UI strings. translations is merged key by key: only the given keys change, and null removes a key. The default language can't be changed here. Languages reach every app user, so this always asks the user to confirm.",
            inputSchema: z
                .object({
                    id: z.string().optional(),
                    version: z.string().optional(),
                    name: z.string().min(1).max(200).optional(),
                    languageCode: z.string().min(1).max(50).optional(),
                    averageReadingSpeed: z.number().positive().max(5000).optional(),
                    memberOf: groupIds.optional(),
                    translations: z.record(z.string(), z.string().nullable()).optional(),
                })
                .strict(),
            annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        async (args, ctx) => {
            const stored = args.id
                ? await loadForUpdate(env, args.id, [DocType.Language], args.version)
                : undefined;
            let doc: Record<string, any>;
            if (stored) {
                doc = { ...stored, translations: { ...(stored.translations ?? {}) } };
            } else {
                if (!args.name || !args.languageCode || !args.memberOf)
                    throw new ToolError(
                        "name, languageCode and memberOf are required to create a language",
                    );
                doc = {
                    _id: newDocId(ctx, "save_language"),
                    type: DocType.Language,
                    memberOf: [],
                    translations: {},
                };
                await assertNewId(env, doc._id);
            }
            for (const field of ["name", "languageCode", "averageReadingSpeed", "memberOf"])
                if ((args as any)[field] !== undefined) doc[field] = (args as any)[field];

            const added: string[] = [];
            const changed: string[] = [];
            const removed: string[] = [];
            for (const [key, value] of Object.entries(args.translations ?? {})) {
                if (value === null) {
                    if (key in doc.translations) removed.push(key);
                    delete doc.translations[key];
                } else {
                    if (!(key in doc.translations)) added.push(key);
                    else if (doc.translations[key] !== value) changed.push(key);
                    doc.translations[key] = value;
                }
            }
            if (!stored) assertCreatesReadable(env, doc);

            return applyWrite(env, ctx, {
                tool: "save_language",
                args,
                doc,
                stored,
                live: true,
                describe: () =>
                    `${stored ? "Change" : "Create"} the language "${doc.name}" (${doc.languageCode}). ` +
                    `Settings changed: ${changedFields(stored, doc, ["name", "languageCode", "averageReadingSpeed", "memberOf"]).join(", ") || "none"}. ` +
                    `UI strings: ${added.length} added, ${changed.length} changed, ${removed.length} removed.`,
            });
        },
    );
}
