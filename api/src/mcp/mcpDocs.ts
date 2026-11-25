import { createHash } from "crypto";
import { DocType } from "../enums";
import { LanguageDto } from "../dto/LanguageDto";

/**
 * Fields an MCP write can change, per doc type. A doc's `version` hashes only these, so server
 * cascades that touch other fields (`parent*`, `availableTranslations`, `taggedDocs`, …) don't
 * make the model's copy stale.
 */
const EDITABLE_FIELDS: Partial<Record<DocType, string[]>> = {
    [DocType.Content]: [
        "title",
        "summary",
        "author",
        "text",
        "slug",
        "seoTitle",
        "seoString",
        "status",
        "publishDate",
        "expiryDate",
    ],
    [DocType.Post]: [
        "memberOf",
        "tags",
        "postType",
        "publishDateVisible",
        "showComingSoon",
        "alwaysOffline",
        "useVerticalTileLayout",
        "authorType",
        "linkDates",
    ],
    [DocType.Tag]: [
        "memberOf",
        "tags",
        "tagType",
        "pinned",
        "publishDateVisible",
        "showComingSoon",
        "alwaysOffline",
        "useVerticalTileLayout",
        "authorType",
        "linkDates",
    ],
    [DocType.Redirect]: ["memberOf", "redirectType", "slug", "toSlug"],
    [DocType.Language]: [
        "memberOf",
        "name",
        "languageCode",
        "averageReadingSpeed",
        "translations",
        "default",
    ],
};

/** Fields never returned to an AI client: internal, credential-related, or bulky. */
const HIDDEN_FIELDS = [
    "_rev",
    "fts",
    "ftsTokenCount",
    "statusChangeDeleteCmdId",
    "imageData",
    "media",
    "parentImageData",
    "parentMedia",
    "credential",
    "credential_id",
    "externalUserId",
];

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.keys(value as object)
            .filter((k) => (value as any)[k] !== undefined)
            .sort()
            .map((k) => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
}

/** Short stable hash of a JSON value. */
export function hashJson(value: unknown): string {
    return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

/** True for the doc types MCP tools can write. */
export function isWritableType(type: DocType): boolean {
    return EDITABLE_FIELDS[type] !== undefined;
}

/** The doc's `version`: required on every update, so a model can't overwrite a change it hasn't seen. */
export function docVersion(doc: any): string | undefined {
    const fields = EDITABLE_FIELDS[doc?.type as DocType];
    if (!fields) return undefined;
    return hashJson(Object.fromEntries(fields.map((f) => [f, doc[f]])));
}

/** A copy of the doc without hidden fields. Large bodies (`text`) are dropped unless kept. */
export function trimDoc(
    doc: any,
    options: { keepText?: boolean; keepTranslations?: boolean } = {},
): Record<string, unknown> {
    const out: Record<string, any> = { ...doc };
    for (const field of HIDDEN_FIELDS) delete out[field];
    if (doc.imageData) out.hasImage = true;
    if (doc.media?.hlsUrl) out.hasMedia = true;
    if (!options.keepText) delete out.text;
    if (doc.type === DocType.Language && !options.keepTranslations) delete out.translations;
    const version = docVersion(doc);
    if (version) out.version = version;
    return out;
}

/** A human-readable title for any readable doc. */
export function docTitle(doc: any, translations: any[] = []): string {
    switch (doc.type) {
        case DocType.Content:
            return doc.title || doc.slug || doc._id;
        case DocType.Post:
        case DocType.Tag:
            return (
                translations[0]?.title || `${doc.postType ?? doc.tagType ?? doc.type} ${doc._id}`
            );
        case DocType.Redirect:
            return `${doc.slug} → ${doc.toSlug ?? ""}`.trim();
        case DocType.User:
            return doc.name ? `${doc.name} <${doc.email}>` : doc.email;
        case DocType.AuthProvider:
            return doc.label || doc.displayName || doc.domain;
        case DocType.AutoGroupMappings:
            return doc.description || `Auto group mapping ${doc._id}`;
        case DocType.DefaultAffinity:
            return "Default recommendations";
        default:
            return doc.name || doc._id;
    }
}

const OVERVIEW_PATHS: Partial<Record<DocType, string>> = {
    [DocType.Redirect]: "redirects",
    [DocType.Group]: "groups",
    [DocType.User]: "users",
    [DocType.Storage]: "storage",
    [DocType.AuthProvider]: "auth-providers",
    [DocType.AutoGroupMappings]: "auto-group-mappings",
    [DocType.DefaultAffinity]: "recommendations",
};

/** A link to the doc in the CMS, or "" when no CMS URL is configured. */
export function cmsLink(doc: any, cmsUrl: string | undefined, languages: LanguageDto[]): string {
    if (!cmsUrl) return "";
    switch (doc.type) {
        case DocType.Content: {
            const subtype = doc.parentPostType ?? doc.parentTagType;
            const code = languages.find((l) => l._id === doc.language)?.languageCode;
            return `${cmsUrl}/${doc.parentType}/edit/${subtype}/${doc.parentId}${code ? `/${code}` : ""}`;
        }
        case DocType.Post:
        case DocType.Tag:
            return `${cmsUrl}/${doc.type}/edit/${doc.postType ?? doc.tagType}/${doc._id}`;
        case DocType.Language:
            return `${cmsUrl}/languages/${doc._id}`;
        default:
            return OVERVIEW_PATHS[doc.type as DocType]
                ? `${cmsUrl}/${OVERVIEW_PATHS[doc.type]}`
                : "";
    }
}

/** Opaque paging cursor. Not signed: it only narrows queries that are permission-filtered anyway. */
export function encodeCursor(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function decodeCursor<T>(cursor: string): T {
    try {
        return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
    } catch {
        throw new Error("Invalid cursor");
    }
}
