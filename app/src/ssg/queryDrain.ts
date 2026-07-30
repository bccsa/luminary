/**
 * Route enumeration for the SSG build: drains a doc type's full set from `/query`
 * via keyset (not offset) pagination. Offset pagination over a live, mutating
 * collection is non-deterministic — a doc changing mid-drain shifts later pages
 * and silently drops rows, capping a build well short of the full route set.
 */

export const QUERY_PAGE_SIZE = 500;
export const QUERY_USE_INDEX = "updatedTimeUtc-type-id-index";

export type QueryCursor = { updatedTimeUtc: number; _id: string };
export type KeysetDocument = QueryCursor;
export type QuerySelector = Record<string, unknown>;
export type QueryType = "content" | "language" | "redirect" | "deleteCmd";

export type KeysetQuery = {
    selector: QuerySelector;
    limit: number;
    sort: Array<Record<string, "asc">>;
    use_index: string;
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
        if (page.length < limit) return docs;
        cursor = advanceQueryCursor(page);
    }
}

/**
 * Drains all content docs eligible for prerendering. `/query` doesn't filter
 * scheduled content server-side (unlike the FTS endpoint it replaced), so the
 * `publishDate <= now` bound here keeps unpublished/future articles out of the build.
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
 * Drains `DeleteCmd` docs for one `docType` value. `/query` requires `docType` as a
 * scalar equality value (no `$in`) for DeleteCmd queries, so a Content-translation
 * delete (whose DeleteCmd carries the parent's `Post`/`Tag` type, never `"content"` —
 * the permission system has no ACLs on Content itself) needs one call per parent type,
 * plus one more for `Redirect` — three calls, not one (see `deleteQueue.ts`).
 *
 * An optional `ids` filter narrows the drain to exactly those DeleteCmd doc ids — a
 * scoped rebuild only wants the entries relevant to the DeleteCmds that triggered it,
 * not the entire historical ledger (see `SSG_DELETE_CMD_IDS` in `vite.config.web.ts`).
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
