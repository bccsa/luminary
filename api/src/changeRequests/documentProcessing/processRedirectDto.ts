import { RedirectDto } from "../../dto/RedirectDto";
import { computeFtsData, REDIRECT_FTS_FIELDS } from "../../util/ftsIndexing";

/**
 * Process Redirect DTO — compute the server-authoritative trigram FTS index over slug + toSlug
 * so the strict `/fts` search can find redirects without a full table scan. `undefined` when
 * there's no indexable text, which also clears a stale index when the slugs change on edit.
 */
export default async function processRedirectDto(doc: RedirectDto): Promise<void> {
    const ftsData = computeFtsData(doc, REDIRECT_FTS_FIELDS);
    doc.fts = ftsData ? ftsData.fts : undefined;
}
