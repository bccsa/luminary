import { Expose } from "class-transformer";
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
} from "class-validator";
import { DocType, PublishStatus, Uuid } from "../enums";

/**
 * Request structure for the server-side full-text search endpoint.
 *
 * Only `apiVersion` and `queryString` are required. Every filter is optional and
 * is applied only when present (an omitted filter never narrows the result set).
 * `types` defaults to both `Post` and `Tag` content when omitted, so the app
 * searches across post and tag content by default.
 */
export class FtsSearchReqDto {
    @IsNotEmpty()
    @IsString()
    @Expose()
    apiVersion?: string;

    /** The search text. */
    @IsNotEmpty()
    @IsString()
    @Expose()
    queryString: string;

    /**
     * Parent content types to search. Defaults to `[Post, Tag]` when omitted.
     */
    @IsOptional()
    @IsArray()
    @IsEnum(DocType, { each: true })
    @Expose()
    types?: Array<DocType>;

    /** Restrict results to these language IDs. */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    languages?: Array<Uuid>;

    @IsOptional()
    @IsNumber()
    @Expose()
    limit?: number;

    @IsOptional()
    @IsNumber()
    @Expose()
    offset?: number;

    /**
     * When true, search unpublished content too (CMS path) and skip the
     * published/scheduled/expired/language visibility filters. Requires the user
     * to have View access on the content's groups.
     */
    @IsOptional()
    @IsBoolean()
    @Expose()
    cms?: boolean;

    /**
     * Restrict to content whose parent tags intersect these tag IDs (CMS
     * tag-scoped search).
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    tags?: Array<Uuid>;

    /**
     * Restrict to docs whose `memberOf` intersects these group IDs. An explicit UI filter,
     * applied *after* permission scoping (it can only narrow access, never widen it). Used by
     * the aux (non-Content) strict search; ignored by the Content path.
     */
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @Expose()
    groups?: Array<Uuid>;

    /** Restrict to this publish status. CMS-only (rejected unless `cms` is true). */
    @IsOptional()
    @IsEnum(PublishStatus)
    @Expose()
    status?: PublishStatus;

    /** Restrict to content with `publishDate` greater than or equal to this value. */
    @IsOptional()
    @IsNumber()
    @Expose()
    publishedAfter?: number;

    /** Restrict to content with `publishDate` less than or equal to this value. */
    @IsOptional()
    @IsNumber()
    @Expose()
    publishedBefore?: number;

    /**
     * Strict mode: keep only docs where every query word (≥3 chars) is a substring of
     * `title` or `author` (AND across words). Pairs with {@link sort} for a precise,
     * field-ordered "find by name" search instead of fuzzy relevance.
     */
    @IsOptional()
    @IsBoolean()
    @Expose()
    matchAllWords?: boolean;

    /**
     * Strict mode: order results by this document field/direction instead of BM25
     * relevance, over the full match set before pagination. `field` is validated against a
     * per-doctype allowlist in the service (Content: title/publishDate/expiryDate/updatedTimeUtc;
     * aux doctypes: e.g. name/email/slug/lastLogin/updatedTimeUtc).
     */
    @IsOptional()
    @IsObject()
    @Expose()
    sort?: {
        field:
            | "title"
            | "publishDate"
            | "expiryDate"
            | "updatedTimeUtc"
            | "name"
            | "email"
            | "slug"
            | "lastLogin";
        direction: "asc" | "desc";
    };

    // ── BM25 tuning overrides (optional; default to the shared client values) ──

    @IsOptional()
    @IsNumber()
    @Expose()
    bm25k1?: number;

    @IsOptional()
    @IsNumber()
    @Expose()
    bm25b?: number;

    @IsOptional()
    @IsNumber()
    @Expose()
    maxTrigramDocPercent?: number;
}
