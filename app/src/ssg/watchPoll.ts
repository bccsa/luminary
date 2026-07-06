import { DocType, type MangoQuery } from "luminary-shared";

export type WatchCursor = { updatedTimeUtc: number; _id: string };
export type WatchDocBase = { _id?: string; updatedTimeUtc: number };
export type WatchPollSpec = {
    type: DocType;
    extra?: Record<string, string | number | boolean>[];
};

export const WATCH_PAGE_LIMIT = 10;
const WATCH_USE_INDEX = "updatedTimeUtc-type-id-index";

export const WATCH_POLL_SPECS: WatchPollSpec[] = [
    { type: DocType.Content },
    { type: DocType.Redirect },
    { type: DocType.DeleteCmd, extra: [{ docType: DocType.Content }] },
    { type: DocType.DeleteCmd, extra: [{ docType: DocType.Post }] },
    { type: DocType.DeleteCmd, extra: [{ docType: DocType.Tag }] },
    { type: DocType.DeleteCmd, extra: [{ docType: DocType.Redirect }] },
];

export function watchCursor(updatedTimeUtc: number, _id = ""): WatchCursor {
    return { updatedTimeUtc, _id };
}

function compareCursor(a: WatchCursor, b: WatchCursor): number {
    return a.updatedTimeUtc - b.updatedTimeUtc || a._id.localeCompare(b._id);
}

function docCursor(doc: WatchDocBase): WatchCursor {
    return watchCursor(doc.updatedTimeUtc, doc._id ?? "");
}

export function advanceWatchCursor(cursor: WatchCursor, docs: WatchDocBase[]): WatchCursor {
    return docs.reduce<WatchCursor>((max, doc) => {
        const next = docCursor(doc);
        return compareCursor(next, max) > 0 ? next : max;
    }, cursor);
}

export function changedSinceQuery(
    spec: WatchPollSpec,
    cursor: WatchCursor,
    limit = WATCH_PAGE_LIMIT,
): MangoQuery {
    return {
        selector: {
            $and: [
                { type: spec.type },
                ...(spec.extra ?? []),
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
            ],
        },
        $sort: [{ updatedTimeUtc: "asc" }, { type: "asc" }, { _id: "asc" }],
        $limit: limit,
        use_index: WATCH_USE_INDEX,
    };
}

export async function fetchChangedDocs<T extends WatchDocBase>(
    queryRemote: (query: MangoQuery) => Promise<T[]>,
    spec: WatchPollSpec,
    since: WatchCursor,
    limit = WATCH_PAGE_LIMIT,
): Promise<T[]> {
    const docs: T[] = [];
    let cursor = since;

    for (;;) {
        const page = await queryRemote(changedSinceQuery(spec, cursor, limit));
        if (!page.length) return docs;
        docs.push(...page);
        cursor = advanceWatchCursor(cursor, page);
        if (page.length < limit) return docs;
    }
}

export async function fetchWatchChanges<T extends WatchDocBase>(
    queryRemote: (query: MangoQuery) => Promise<T[]>,
    specs: WatchPollSpec[],
    since: WatchCursor,
    limit = WATCH_PAGE_LIMIT,
): Promise<{ docs: T[]; cursor: WatchCursor }> {
    const docs = (
        await Promise.all(specs.map((spec) => fetchChangedDocs(queryRemote, spec, since, limit)))
    ).flat();
    return { docs, cursor: advanceWatchCursor(since, docs) };
}
