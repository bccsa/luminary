/**
 * Route enumeration for the SSG build: drains a doc type's full set from `/query`
 * via keyset (not offset) pagination. Offset pagination over a live, mutating
 * collection is non-deterministic — a doc changing mid-drain shifts later pages
 * and silently drops rows, capping a build well short of the full route set.
 */

export const QUERY_PAGE_SIZE = 500;
export const QUERY_USE_INDEX = "updatedTimeUtc-type-id-index";
// Labels the build's enumeration traffic in the API's expensive-query logs so it
// is separable from app and sync load.
export const QUERY_IDENTIFIER = "ssgDrain";

export type QueryCursor = { updatedTimeUtc: number; _id: string };
export type KeysetDocument = QueryCursor;
export type QuerySelector = Record<string, unknown>;
export type QueryType = "content" | "language" | "redirect" | "deleteCmd";

export type KeysetQuery = {
    selector: QuerySelector;
    limit: number;
    sort: Array<Record<string, "asc">>;
    use_index: string;
    identifier: string;
};

/** Injected by the caller (`vite.config.web.ts`) as a thin `fetch` wrapper around `/query`. */
export type QueryTransport = <T extends KeysetDocument>(query: KeysetQuery) => Promise<T[]>;

export type DrainQueryOptions = {
    type: QueryType;
    conditions?: QuerySelector[];
    limit?: number;
};

/**
 * Builds one page's Mango query. Once a cursor exists, adds a tiebreak condition
 * (`updatedTimeUtc > cursor`, or equal-timestamp with `_id > cursor._id`) so
 * same-timestamp rows stay totally ordered with no row skipped or repeated.
 */
export function buildKeysetQuery(options: DrainQueryOptions, cursor?: QueryCursor): KeysetQuery {
    const cursorCondition = cursor
        ? [
              {
                  $or: [
                      { updatedTimeUtc: { $gt: cursor.updatedTimeUtc } },
                      {
                          $and: [
                              { updatedTimeUtc: cursor.updatedTimeUtc },
                              { _id: { $gt: cursor._id } },
                          ],
                      },
                  ],
              },
          ]
        : [];

    return {
        selector: {
            $and: [{ type: options.type }, ...(options.conditions ?? []), ...cursorCondition],
        },
        limit: options.limit ?? QUERY_PAGE_SIZE,
        sort: [{ updatedTimeUtc: "asc" }, { type: "asc" }, { _id: "asc" }],
        use_index: QUERY_USE_INDEX,
        identifier: QUERY_IDENTIFIER,
    };
}

/** Derives the next page's cursor from the last row of the current page. */
export function advanceQueryCursor(page: KeysetDocument[]): QueryCursor {
    const last = page[page.length - 1];
    if (!last) throw new Error("[ssg] cannot advance an enumeration cursor from an empty page");
    return { updatedTimeUtc: last.updatedTimeUtc, _id: last._id };
}

/** Pages through `transport` until a short (or empty) page signals the last one. */
export async function drainQuery<T extends KeysetDocument>(
    transport: QueryTransport,
    options: DrainQueryOptions,
): Promise<T[]> {
    const docs: T[] = [];
    const limit = options.limit ?? QUERY_PAGE_SIZE;
    let cursor: QueryCursor | undefined;

    for (;;) {
        const page = await transport<T>(buildKeysetQuery({ ...options, limit }, cursor));
        docs.push(...page);
        // An empty page is the unambiguous end of the corpus.
        if (page.length === 0) return docs;
        if (page.length < limit) {
            // A short non-empty page *should* be the final page, but a server-side cap,
            // timeout or partial page can truncate the corpus mid-drain — which would
            // silently drop every remaining row and empty all downstream per-page queries.
            // Probe one more page: real end returns nothing, a truncation returns more.
            cursor = advanceQueryCursor(page);
            const probe = await transport<T>(buildKeysetQuery({ ...options, limit }, cursor));
            if (probe.length > 0) {
                throw new Error(
                    `[ssg] ${options.type} drain truncated: short page returned ` +
                        `${page.length} doc(s) (limit ${limit}) but a probe found ` +
                        `${probe.length} more — the corpus was cut short mid-drain`,
                );
            }
            return docs;
        }
        cursor = advanceQueryCursor(page);
    }
}

/**
 * Drains all content docs eligible for prerendering. `/query` doesn't filter
 * scheduled content server-side, so the `publishDate <= now` bound keeps future
 * articles out of the build.
 */
export function enumeratePublicContent<T extends KeysetDocument>(
    transport: QueryTransport,
    now: number,
): Promise<T[]> {
    return drainQuery<T>(transport, {
        type: "content",
        conditions: [{ publishDate: { $lte: now } }],
    });
}

/**
 * Drains `DeleteCmd` docs for one scalar `docType` (the API doesn't accept `$in`
 * here, so callers issue one drain per type). Pass `ids` to narrow a scoped rebuild
 * to just the DeleteCmds that triggered it.
 */
export function enumerateDeleteCmds<T extends KeysetDocument>(
    transport: QueryTransport,
    docType: string,
    ids?: string[],
): Promise<T[]> {
    const conditions: QuerySelector[] = [{ docType }];
    if (ids?.length) conditions.push({ _id: { $in: ids } });
    return drainQuery<T>(transport, { type: "deleteCmd", conditions });
}