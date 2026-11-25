import { db } from "../../db/database";
import { DocType, type BaseDocumentDto } from "../../types";
import { merge } from "./merge";
import { buildSyncQuery } from "./query";
import { syncListOf, syncTolerance, tuplePaginationSupported } from "./state";
import { cancelSync, syncCancellationGeneration } from "./sync";
import type { SyncOptions } from "./types";
import { calcChunk, filterByTypeMemberOf, getChunkTypeString, resolveRange } from "./utils";

/** Exhaust each immutable window by timestamp/id before publishing its completed coverage. */
export async function syncBatchStable(options: SyncOptions) {
    const list = syncListOf(options.source);
    const generation = syncCancellationGeneration;
    const cancelled = () =>
        cancelSync ||
        generation !== syncCancellationGeneration ||
        !!options.isCancelled?.() ||
        !!options.source?.isCancelled?.();
    const persist = () => (options.source ? options.source.setSyncList() : db.setSyncList());
    const matches = filterByTypeMemberOf(options);
    let initial = options.initialSync;
    let firstSync: boolean | undefined;

    while (!cancelled()) {
        let host = list.value.find((entry) => matches(entry) && entry.pendingPage);
        const window = host?.pendingPage;
        const chunk = window
            ? { blockStart: window.start, blockEnd: window.end }
            : calcChunk({ ...options, initialSync: initial });
        chunk.blockEnd = Math.max(0, chunk.blockEnd);
        firstSync ??= chunk.blockEnd === 0;
        if (chunk.blockStart < chunk.blockEnd) {
            if (chunk.blockEnd - chunk.blockStart > syncTolerance)
                throw new Error("Invalid sync pagination window");
            const result = merge(options);
            return { ...result, firstSync };
        }
        const query = buildSyncQuery(options, chunk);
        query.sort = [{ updatedTimeUtc: "desc" }, { _id: "desc" }];
        query.use_index = query.use_index.replace(/-index$/, "-cursor-v1-index");
        const queryKey = JSON.stringify(query);
        if (host?.pendingPage && host.pendingPage.queryKey !== queryKey) {
            const previous = host.pendingPage;
            if (previous.provisional) list.value.splice(list.value.indexOf(host), 1);
            else {
                host.eof = previous.previousEof;
                delete host.pendingPage;
            }
            await persist();
            continue;
        }
        if (!host) {
            host = list.value.find(matches);
            const provisional = !host;
            if (!host) {
                host = {
                    chunkType: getChunkTypeString(
                        options.type,
                        options.subType,
                        options.alwaysOffline,
                    ),
                    memberOf: [...options.memberOf],
                    languages: options.languages ? [...options.languages] : undefined,
                    blockStart: 0,
                    blockEnd: 0,
                    eof: false,
                    ...(options.type === DocType.Content
                        ? {
                              publishDateMin: resolveRange(
                                  options.publishDateMin,
                                  options.publishDateMax,
                              ).min,
                              publishDateMax: resolveRange(
                                  options.publishDateMin,
                                  options.publishDateMax,
                              ).max,
                          }
                        : {}),
                };
                list.value.push(host);
            }
            host.pendingPage = {
                start: chunk.blockStart,
                end: chunk.blockEnd,
                queryKey,
                previousEof: host.eof,
                provisional,
            };
            host.eof = false;
            await persist();
        }
        const page = host.pendingPage!;
        const invalidated = () => cancelled() || !list.value.includes(host!) || !matches(host!);
        while (!invalidated()) {
            let unsupported = false;
            const res = await options.httpService.post(
                options.source?.queryPath ?? "query",
                {
                    ...query,
                    syncPagination: {
                        version: 1,
                        ...(page.after ? { after: { ...page.after } } : {}),
                    },
                },
                {
                    onError: (status, message) => {
                        if (
                            status === 400 &&
                            /Unexpected top-level key 'syncPagination'|Unknown index 'sync-.+-cursor-v1-index'/.test(
                                message ?? "",
                            )
                        ) {
                            unsupported = true;
                            tuplePaginationSupported.value = false;
                        }
                    },
                },
            );
            if (unsupported || invalidated()) return;
            if (!res || !Array.isArray(res.docs)) throw new Error("Invalid API response format");
            const docs = res.docs as BaseDocumentDto[];
            if (
                docs.length > options.limit ||
                docs.some(
                    (doc) =>
                        typeof doc._id !== "string" ||
                        !doc._id ||
                        !Number.isSafeInteger(doc.updatedTimeUtc) ||
                        doc.updatedTimeUtc < page.end ||
                        doc.updatedTimeUtc > (page.after?.updatedTimeUtc ?? page.start),
                )
            )
                throw new Error("Invalid sync pagination response");
            const last = docs[docs.length - 1];
            if (
                last &&
                page.after &&
                last._id === page.after.id &&
                last.updatedTimeUtc === page.after.updatedTimeUtc
            )
                throw new Error("Sync pagination did not advance; progress remains incomplete");
            for (const warning of [
                res.warning,
                ...(Array.isArray(res.warnings) ? res.warnings : []),
            ].filter(Boolean))
                console.warn("[sync] API warning received:", warning, {
                    use_index: query.use_index,
                    limit: options.limit,
                    resultCount: docs.length,
                });
            if (docs.length) {
                if (options.source) await options.source.put(docs);
                else await db.applySyncPage(docs, invalidated);
                if (invalidated()) return;
                page.newest ??= docs[0].updatedTimeUtc;
            }
            if (docs.length === options.limit) {
                page.after = { updatedTimeUtc: last.updatedTimeUtc, id: last._id };
                await persist();
                continue;
            }

            // All pages in this window are durable; only now can its time range be merged.
            const blockStart =
                page.newest ??
                (page.start < Number.MAX_SAFE_INTEGER
                    ? page.start
                    : Math.max(0, ...list.value.filter(matches).map((entry) => entry.blockStart)));
            if (page.provisional) list.value.splice(list.value.indexOf(host), 1);
            else {
                host.eof = page.previousEof;
                delete host.pendingPage;
            }
            const { min, max } = resolveRange(options.publishDateMin, options.publishDateMax);
            list.value.unshift({
                chunkType: getChunkTypeString(options.type, options.subType, options.alwaysOffline),
                memberOf: [...options.memberOf],
                languages: options.languages ? [...options.languages] : undefined,
                blockStart,
                blockEnd: page.end,
                eof: page.end === 0,
                ...(options.type === DocType.Content
                    ? { publishDateMin: min, publishDateMax: max }
                    : {}),
            });
            const result = merge(options);
            await persist();
            if (invalidated() && cancelled()) return;
            if (result.eof) return { ...result, firstSync };
            initial = false;
            const next = calcChunk({ ...options, initialSync: false });
            if (next.blockStart === chunk.blockStart && next.blockEnd === chunk.blockEnd)
                throw new Error(
                    "Completed sync window could not advance; progress remains incomplete",
                );
            break;
        }
        if (cancelled() || !host) return;
    }
}
