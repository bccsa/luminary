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
        if (
            cmsLanguageIdsSorted.length > 0 &&
            (accessMapChanged || connectedChanged || cmsLanguagesChanged)
        ) {
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

            // Sync languages
            if (access[DocType.Language] && access[DocType.Language].length) {
                sync({
                    type: DocType.Language,
                    memberOf: access[DocType.Language],
                    limit: 100,
                    cms: true,
                    includeDeleteCmds: true,
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
 * Initialize content sync watcher for posts, tags, groups and redirects.
 */
export function initSync() {
    watch(
        () => syncIterators.value.content,
        async () => {
            if (!isConnected.value) return;
            const access = getAccessibleGroups(AclPermission.View);

            // Sync posts and related content docs
            if (access[DocType.Post] && access[DocType.Post].length) {
                sync({
                    type: DocType.Post,
                    memberOf: access[DocType.Post],
                    limit: 1000,
                    cms: true,
                }).catch((err) => {
                    console.error("Error during post sync:", err);
                    Sentry?.captureException(err);
                });

                sync({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: access[DocType.Post],
                    languages: cmsLanguageIdsAsRef.value,
                    limit: 100,
                    cms: true,
                    includeDeleteCmds: false, // Delete commands use the parent type for permissions calculations, and are already handled by the post sync
                }).catch((err) => {
                    console.error("Error during post content sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync tags and related content docs
            if (access[DocType.Tag] && access[DocType.Tag].length) {
                sync({
                    type: DocType.Tag,
                    memberOf: access[DocType.Tag],
                    limit: 1000,
                    cms: true,
                }).catch((err) => {
                    console.error("Error during tag sync:", err);
                    Sentry?.captureException(err);
                });

                sync({
                    type: DocType.Content,
                    subType: DocType.Tag,
                    memberOf: access[DocType.Tag],
                    languages: cmsLanguageIdsAsRef.value,
                    limit: 1000,
                    cms: true,
                    includeDeleteCmds: false, // Delete commands use the parent type for permissions calculations, and are already handled by the tag sync
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
                    limit: 1000,
                    cms: true,
                }).catch((err) => {
                    console.error("Error during redirect sync:", err);
                    Sentry?.captureException(err);
                });
            }

            // Sync groups
            if (access[DocType.Group] && access[DocType.Group].length) {
                sync({
                    type: DocType.Group,
                    memberOf: access[DocType.Group],
                    limit: 1000,
                    cms: true,
                }).catch((err) => {
                    console.error("Error during group sync:", err);
                    Sentry?.captureException(err);
                });
            }
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
