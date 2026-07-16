export const QUERY_PAGE_SIZE = 500;
export const QUERY_USE_INDEX = "updatedTimeUtc-type-id-index";

export type QueryCursor = { updatedTimeUtc: number; _id: string };
export type KeysetDocument = QueryCursor;
export type QuerySelector = Record<string, unknown>;
export type QueryType = "content" | "language" | "redirect";

export type KeysetQuery = {
    selector: QuerySelector;
    limit: number;
    sort: Array<Record<string, "asc">>;
    use_index: string;
};

export type QueryTransport = <T extends KeysetDocument>(query: KeysetQuery) => Promise<T[]>;

export type DrainQueryOptions = {
    type: QueryType;
    conditions?: QuerySelector[];
    limit?: number;
};

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

export function advanceQueryCursor(page: KeysetDocument[]): QueryCursor {
    const last = page[page.length - 1];
    if (!last) throw new Error("[ssg] cannot advance an enumeration cursor from an empty page");
    return { updatedTimeUtc: last.updatedTimeUtc, _id: last._id };
}

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
