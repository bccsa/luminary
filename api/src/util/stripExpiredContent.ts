import { DocType, PublishStatus } from "../enums";

/**
 * Fields retained on an expired-Content "cleanup stub" sent to non-CMS clients.
 *
 * A non-CMS client (app, or any `cms !== true` query/socket consumer) only ever receives an
 * expired Content doc so it can *prune* its stale local copy — never to display it. So the body
 * must not go over the wire. We keep just enough for the client to:
 *   - identify the record:            `_id`, `type`
 *   - resolve update conflicts:       `_rev`, `updatedTimeUtc`
 *   - advance its sync cursor:        `updatedTimeUtc`
 *   - prune via `deleteExpired()`:    `expiryDate` (+ `status`)
 *   - hide it on older clients that lack delete-on-ingest (read-filter `mangoIsPublished`):
 *                                     `status`, `publishDate`, `expiryDate`, `language`
 *   - route/permission-scope:         `memberOf`, `parentType`, `parentId`
 *
 * Everything else — `title`, `text`, `summary`, `author`, `slug`, `seo*`, `audio`, `video`,
 * image fields, `tags`/`parentTags`, `availableTranslations`, and the server-only `fts`/
 * `ftsTokenCount` — is dropped.
 *
 * Shared by `/query` (QueryService) and the Socket.io base-room emit so the two stay in lockstep.
 */
const KEEP_FIELDS = [
    "_id",
    "_rev",
    "type",
    "parentId",
    "parentType",
    "memberOf",
    "language",
    "status",
    "publishDate",
    "expiryDate",
    "updatedTimeUtc",
] as const;

/**
 * True when `doc` is a Content document that is published but past its expiry date — i.e. a doc
 * an app holds (or could hold) that must now be cleaned up. Drafts (`status !== Published`) are
 * never delivered to non-CMS clients in the first place, so they are not "expired" here.
 */
export function isExpiredContent(doc: any, now: number): boolean {
    return (
        !!doc &&
        doc.type === DocType.Content &&
        doc.status === PublishStatus.Published &&
        typeof doc.expiryDate === "number" &&
        doc.expiryDate <= now
    );
}

/**
 * Project an expired Content doc down to the minimal cleanup stub (see KEEP_FIELDS). Returns a new
 * object; the input is not mutated. Only call on docs for which `isExpiredContent` is true.
 */
export function stripExpiredContent<T extends Record<string, any>>(doc: T): Partial<T> {
    const stub: Record<string, any> = {};
    for (const field of KEEP_FIELDS) {
        if (doc[field] !== undefined) stub[field] = doc[field];
    }
    return stub as Partial<T>;
}
