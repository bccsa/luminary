/** Default environment adapters used by the compatibility facade. */
import { effectScope, watch } from "vue";
import { db } from "../../db/database";
import { touchRetention } from "../../db/retention";
import { getContentPublishDateCutoff } from "../../config";
import { OPEN_MIN } from "../../api/sync/utils";
import { getSocket, isConnected } from "../../socket/socketio";
import { subscribeRooms } from "../../socket/roomSubscriptions";
import { DocType, type BaseDocumentDto } from "../../types";
import { mangoCompile } from "../MangoQuery/mangoCompile";
import { useDexieLiveQuery } from "../useDexieLiveQuery/useDexieLiveQuery";
import { typeIsInSyncList, typeInSyncListRef } from "./queryIntrospection";
import { toDeleteSelector } from "./queryPlanner";
import { planBrowserQuery } from "./browserPlanner";
import { queryLocal, queryRemote } from "./querySources";
import { readResponseCache, structuralCacheKey, writeResponseCache } from "./responseCache";
import type { HybridQueryOptions } from "./options";
import type { QueryCapabilities } from "./contracts";

export function createBrowserCapabilities<T extends BaseDocumentDto>(
    options: HybridQueryOptions,
): QueryCapabilities<T> {
    const coverage = {
        cutoff: getContentPublishDateCutoff,
        isSynced: typeIsInSyncList,
        watchMembership: (type: DocType, changed: () => void) =>
            watch(typeInSyncListRef(type), changed, { immediate: false }),
    };
    return {
        plan: (query) => planBrowserQuery<T>(query, coverage),
        sources: {
            // Dexie holds every doc the browser routes locally, so a read is always covered.
            readLocal: async (query) => ({ docs: await queryLocal<T>(query), covered: true }),
            readRemote: queryRemote<T>,
            observeLocal(query, onValue, onError, own) {
                const scope = effectScope(true);
                own(() => scope.stop());
                scope.run(() => {
                    const source = useDexieLiveQuery<T[]>(() => queryLocal<T>(query), { onError });
                    watch(
                        source,
                        (docs) => {
                            if (docs !== undefined) onValue(docs);
                        },
                        { immediate: true },
                    );
                });
            },
            observeRemote(query, type, onChanges, own) {
                const matches = mangoCompile(query.selector);
                const matchesDelete = mangoCompile(toDeleteSelector(query.selector, type));
                const callback = (data: Parameters<typeof onChanges>[0]) =>
                    onChanges(data, matches, matchesDelete);
                const stop = watch(
                    isConnected,
                    (connected) => {
                        getSocket().off("data", callback);
                        if (connected) getSocket().on("data", callback);
                    },
                    { immediate: true },
                );
                own(stop);
                own(() => getSocket().off("data", callback));
            },
            connected: () => isConnected.value,
            watchConnection: (callback) => watch(isConnected, callback),
            joinRooms: (type) => subscribeRooms([type]),
            validateDelete: (command) => db.validateDeleteCommand(command),
        },
        coverage,
        cache: options.cache
            ? {
                  key: structuralCacheKey,
                  read: readResponseCache,
                  write: writeResponseCache,
              }
            : undefined,
        persistence: {
            touchLocal(docs) {
                const cutoff = getContentPublishDateCutoff();
                if (cutoff === OPEN_MIN) return;
                const ids: string[] = [];
                for (const doc of docs) {
                    const pd = (doc as { publishDate?: number }).publishDate;
                    if (doc.type === DocType.Content && pd !== undefined && pd < cutoff)
                        ids.push(doc._id);
                }
                if (ids.length) touchRetention(ids);
            },
            persistRemote: options.persistOffline
                ? (docs) => {
                      const content = docs.filter((doc) => doc.type === DocType.Content);
                      if (content.length) {
                          void db
                              .bulkPut(content)
                              .catch((error) =>
                                  console.error("[HybridQuery] offline persist failed:", error),
                              );
                          touchRetention(content.map((doc) => doc._id));
                      }
                  }
                : undefined,
        },
    };
}
