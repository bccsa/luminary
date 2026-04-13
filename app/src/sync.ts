import { ref, watch } from "vue";
import {
    accessMap,
    AclPermission,
    db,
    DocType,
    getAccessibleGroups,
    isConnected,
    setCancelSync,
    sync,
    syncFallbackContent,
    type AccessMap,
} from "luminary-shared";
import { appLanguageIdsAsRef, Sentry } from "./globalConfig";
import _ from "lodash";

export const syncIterators = ref<{ language: number; content: number }>({
    language: 0,
    content: 0,
});
let accessMapPrev: AccessMap;
let isConnectedPrev: boolean;
let appLanguageIdsPrev: string[];

// Increment sync iterators when access map, connection status, or app languages change
watch(
    [accessMap, isConnected, appLanguageIdsAsRef],
    () => {
        let accessMapChanged = false;
        if (!_.isEqual(accessMapPrev, accessMap.value)) {
            accessMapChanged = true;
            accessMapPrev = _.cloneDeep(accessMap.value);
        }

        let connectedChanged = false;
        if (isConnectedPrev !== isConnected.value) {
            connectedChanged = true;
            isConnectedPrev = isConnected.value;
        }

        let appLanguagesChanged = false;
        const appLanguageIdsSorted = [...appLanguageIdsAsRef.value].sort();
        if (!_.isEqual(appLanguageIdsPrev, appLanguageIdsSorted)) {
            appLanguagesChanged = true;
            appLanguageIdsPrev = appLanguageIdsSorted;
        }

        if (accessMapChanged || connectedChanged) syncIterators.value.language++;
        if (accessMapChanged || connectedChanged || appLanguagesChanged)
            syncIterators.value.content++;
    },
    { deep: true },
);

/**
 * Initialize language document sync watcher.
 */
export function initLanguageSync() {
    watch(
        () => syncIterators.value.language,
        async () => {
            if (!isConnected.value) {
                setCancelSync(true);
                return;
            }

            setCancelSync(false);

            const access = getAccessibleGroups(AclPermission.View);

            // Sync languages
            if (access[DocType.Language] && access[DocType.Language].length) {
                sync({
                    type: DocType.Language,
                    memberOf: access[DocType.Language],
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    console.error("Error during language sync:", err);
                    Sentry?.captureException(err);
                });
            }
        },
        {
            immediate: true,
        },
    );
}

/**
 * Initialize the sync watcher for all other document types.
 */
export function initSync() {
    // Sync all other docs
    watch(
        () => syncIterators.value.content,
        async () => {
            if (!isConnected.value) return;
            if (!appLanguageIdsAsRef.value.length) return;

            const access = getAccessibleGroups(AclPermission.View);

            // Sync post content docs (phase 1 = preferred languages, phase 2 = fallback)
            if (access[DocType.Post] && access[DocType.Post].length) {
                runContentSync(DocType.Post, access[DocType.Post]).catch((err) => {
                    console.error("Error during sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync tag content docs (phase 1 + phase 2)
            if (access[DocType.Tag] && access[DocType.Tag].length) {
                runContentSync(DocType.Tag, access[DocType.Tag]).catch((err) => {
                    console.error("Error during tag content sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync redirects
            if (access[DocType.Redirect] && access[DocType.Redirect].length) {
                sync({
                    type: DocType.Redirect,
                    memberOf: access[DocType.Redirect],
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    console.error("Error during redirect sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync storages
            if (access[DocType.Storage] && access[DocType.Storage].length) {
                sync({
                    type: DocType.Storage,
                    memberOf: access[DocType.Storage],
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    console.error("Error during storage sync:", err);
                    Sentry?.captureException(err);
                });
            }
        },
        { immediate: true },
    );
}

/**
 * Run phase 1 (preferred-language sync) followed by phase 2 (fallback sync) for
 * a given content subType. Phase 2 covers parents for which phase 1 produced no
 * local content doc — without it, the last-resort branch of
 * `buildLanguagePrioritySelector` in `mangoIsPublished` would have nothing to
 * match and those parents would silently disappear from the app.
 */
async function runContentSync(subType: DocType.Post | DocType.Tag, memberOf: string[]) {
    await sync({
        type: DocType.Content,
        subType,
        memberOf,
        languages: appLanguageIdsAsRef.value,
        limit: 100,
        cms: false,
    });

    await runFallbackContentSync(subType, memberOf);
}

/**
 * Fallback content sync pass. Finds parents the user can access but for which
 * no content doc exists locally, and requests any translation of those parents
 * from the API via `syncFallbackContent`.
 */
async function runFallbackContentSync(
    subType: DocType.Post | DocType.Tag,
    memberOf: string[],
) {
    // All accessible parents of this subType
    const parents = (await db.docs
        .where("type")
        .equals(subType)
        .and((d: any) => Array.isArray(d.memberOf) && d.memberOf.some((g: string) => memberOf.includes(g)))
        .toArray()) as Array<{ _id: string }>;

    if (parents.length === 0) return;

    const accessibleParentIds = new Set(parents.map((p) => p._id));

    // Parents that already have at least one local content doc (any language)
    const localContent = (await db.docs
        .where("type")
        .equals(DocType.Content)
        .and((d: any) => d.parentType === subType)
        .toArray()) as Array<{ parentId: string }>;

    const coveredParentIds = new Set(localContent.map((c) => c.parentId));

    const uncovered = [...accessibleParentIds].filter((id) => !coveredParentIds.has(id));
    if (uncovered.length === 0) return;

    await syncFallbackContent({
        parentIds: uncovered,
        subType,
        memberOf,
        cms: false,
    });
}

/**
 * Manually trigger a sync cycle for both language and content syncs
 */
export function triggerSync() {
    syncIterators.value.language++;
    syncIterators.value.content++;
}
