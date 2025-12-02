import { ref, watch } from "vue";
import {
    accessMap,
    AclPermission,
    DocType,
    getAccessibleGroups,
    isConnected,
    setCancelSync,
    sync,
    type AccessMap,
} from "luminary-shared";
import { cmsLanguageIdsAsRef, Sentry } from "./globalConfig";
import _ from "lodash";

export const syncIterators = ref<{ language: number; content: number }>({
    language: 0,
    content: 0,
});
let accessMapPrev: AccessMap;
let isConnectedPrev: boolean;
let cmsLanguageIdsPrev: string[];

// Increment sync iterators when access map, connection status, or CMS languages change
watch(
    [accessMap, isConnected, cmsLanguageIdsAsRef],
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

        let cmsLanguagesChanged = false;
        const cmsLanguageIdsSorted = [...cmsLanguageIdsAsRef.value].sort();
        if (!_.isEqual(cmsLanguageIdsPrev, cmsLanguageIdsSorted)) {
            cmsLanguagesChanged = true;
            cmsLanguageIdsPrev = cmsLanguageIdsSorted;
        }

        if (accessMapChanged || connectedChanged) syncIterators.value.language++;
        if (accessMapChanged || connectedChanged || cmsLanguagesChanged) {
            syncIterators.value.content++;
        }
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

            const syncPromises = [];

            // Sync languages
            if (access[DocType.Language] && access[DocType.Language].length) {
                syncPromises.push(
                    sync({
                        type: DocType.Language,
                        memberOf: access[DocType.Language],
                        limit: 100,
                        cms: true,
                    }).catch((err) => {
                        console.error("Error during language sync:", err);
                        Sentry?.captureException(err);
                    }),
                );
            }

            await Promise.all(syncPromises);
        },
        {
            immediate: true,
        },
    );
}

/**
 * Initialize content sync watcher for posts, tags, groups and redirects.
 */
export function initSync() {
    watch(
        () => syncIterators.value.content,
        async () => {
            if (!isConnected.value) return;

            const access = getAccessibleGroups(AclPermission.View);

            const syncPromises = [];

            // Sync posts and related content docs
            if (access[DocType.Post] && access[DocType.Post].length) {
                syncPromises.push(
                    sync({
                        type: DocType.Post,
                        memberOf: access[DocType.Post],
                        limit: 100,
                        cms: true,
                    }).catch((err) => {
                        console.error("Error during post sync:", err);
                        Sentry?.captureException(err);
                    }),
                );

                syncPromises.push(
                    sync({
                        type: DocType.Content,
                        subType: DocType.Tag,
                        memberOf: access[DocType.Tag],
                        languages: cmsLanguageIdsAsRef.value,
                        limit: 100,
                        cms: false,
                    }).catch((err) => {
                        console.error("Error during sync:", err);
                        Sentry?.captureException(err);
                    }),
                );
            }

            // Sync tags and related content docs
            if (access[DocType.Tag] && access[DocType.Tag].length) {
                syncPromises.push(
                    sync({
                        type: DocType.Tag,
                        memberOf: access[DocType.Tag],
                        limit: 100,
                        cms: true,
                    }).catch((err) => {
                        console.error("Error during tag sync:", err);
                        Sentry?.captureException(err);
                    }),
                );

                syncPromises.push(
                    sync({
                        type: DocType.Content,
                        subType: DocType.Post,
                        memberOf: access[DocType.Post],
                        languages: cmsLanguageIdsAsRef.value,
                        limit: 100,
                        cms: false,
                    }).catch((err) => {
                        console.error("Error during tag content sync:", err);
                        Sentry?.captureException(err);
                    }),
                );
            }

            // Sync redirects
            if (access[DocType.Redirect] && access[DocType.Redirect].length) {
                syncPromises.push(
                    sync({
                        type: DocType.Redirect,
                        memberOf: access[DocType.Redirect],
                        limit: 100,
                        cms: true,
                    }).catch((err) => {
                        console.error("Error during redirect sync:", err);
                        Sentry?.captureException(err);
                    }),
                );
            }

            // Sync groups
            if (access[DocType.Group] && access[DocType.Group].length) {
                syncPromises.push(
                    sync({
                        type: DocType.Group,
                        memberOf: access[DocType.Group],
                        limit: 100,
                        cms: true,
                    }).catch((err) => {
                        console.error("Error during group sync:", err);
                        Sentry?.captureException(err);
                    }),
                );
            }

            await Promise.all(syncPromises);
        },
    );
}

/**
 * Manually trigger a sync cycle for all sync types
 */
export function triggerSync() {
    syncIterators.value.language++;
    syncIterators.value.content++;
}
