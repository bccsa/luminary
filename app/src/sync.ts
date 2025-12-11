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
        if (_.isEqual(accessMapPrev, accessMap.value)) {
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

            // Sync post content docs
            if (access[DocType.Post] && access[DocType.Post].length) {
                sync({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: access[DocType.Post],
                    languages: appLanguageIdsAsRef.value,
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    console.error("Error during sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync tag content docs
            if (access[DocType.Tag] && access[DocType.Tag].length) {
                sync({
                    type: DocType.Content,
                    subType: DocType.Tag,
                    memberOf: access[DocType.Tag],
                    languages: appLanguageIdsAsRef.value,
                    limit: 100,
                    cms: false,
                }).catch((err) => {
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
        },
        { immediate: true },
    );
}

/**
 * Manually trigger a sync cycle for both language and content syncs
 */
export function triggerSync() {
    syncIterators.value.language++;
    syncIterators.value.content++;
}
