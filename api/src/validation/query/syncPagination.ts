import { BadRequestException } from "@nestjs/common";

export const SYNC_PAGINATION = "timestamp-id-v1";

/** Validate the opt-in cursor without accepting arbitrary CouchDB pagination options. */
export function syncPaginationError(query: any): string | undefined {
    const page = query?.syncPagination;
    if (page === undefined) return;
    if (
        !page ||
        typeof page !== "object" ||
        Array.isArray(page) ||
        Object.keys(page).some((key) => !["version", "after"].includes(key)) ||
        page.version !== 1
    )
        return "Invalid syncPagination version or shape";
    if (
        typeof query.use_index !== "string" ||
        !/^sync-.+-cursor-v1-index$/.test(query.use_index) ||
        JSON.stringify(query.sort) !== JSON.stringify([{ updatedTimeUtc: "desc" }, { _id: "desc" }])
    )
        return "syncPagination requires a timestamp/id index and descending sort";
    const selector = query.selector;
    const type = selector?.type;
    const base =
        type === "content"
            ? `sync-content${selector.parentAlwaysOffline === true ? "-alwaysOffline" : ""}`
            : `sync-${type === "deleteCmd" ? `${selector.docType}-` : ""}${type}`;
    if (typeof type !== "string" || query.use_index !== `${base}-cursor-v1-index`)
        return "syncPagination index does not match its document type";
    const bounds = query.selector?.updatedTimeUtc;
    if (
        !bounds ||
        !Number.isSafeInteger(bounds.$gte) ||
        !Number.isSafeInteger(bounds.$lte) ||
        bounds.$gte < 0 ||
        bounds.$lte < bounds.$gte ||
        !Number.isSafeInteger(query.limit) ||
        query.limit < 1
    )
        return "syncPagination requires bounded timestamps and an integer limit";
    if (page.after === undefined) return;
    const after = page.after;
    if (
        !after ||
        typeof after !== "object" ||
        Array.isArray(after) ||
        Object.keys(after).some((key) => !["updatedTimeUtc", "id"].includes(key)) ||
        !Number.isSafeInteger(after.updatedTimeUtc) ||
        after.updatedTimeUtc < bounds.$gte ||
        after.updatedTimeUtc > bounds.$lte ||
        typeof after.id !== "string" ||
        !after.id
    )
        return "Invalid syncPagination continuation";
}

/** Add the exclusive continuation inside the existing selector and strip transport metadata. */
export function applySyncPagination<T>(input: T, owner?: string): T {
    const query = input as any;
    const error = syncPaginationError(query);
    if (error) throw new BadRequestException(error);
    if (query.syncPagination === undefined) return input;
    const { syncPagination, ...result } = query;
    const after = syncPagination.after;
    if (!after) return result;
    if (owner && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after.id))
        throw new BadRequestException("Activity continuation requires a client UUID");
    result.selector = {
        ...query.selector,
        $and: [
            ...(query.selector.$and ?? []),
            {
                $or: [
                    { updatedTimeUtc: { $lt: after.updatedTimeUtc } },
                    {
                        updatedTimeUtc: after.updatedTimeUtc,
                        _id: { $lt: owner ? `${owner}:${after.id}` : after.id },
                    },
                ],
            },
        ],
    };
    return result;
}
