import { ref, toRaw, watch } from "vue";
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
import { appSyncedLanguageIdsAsRef } from "./globalConfig";
import { Sentry } from "./util/initSentry";

import { cloneDeep, isEqual } from "lodash-es";

export const syncIterators = ref<{ language: number; content: number }>({
    language: 0,
    content: 0,
});
let accessMapPrev: AccessMap;
let isConnectedPrev: boolean;
let appLanguageIdsPrev: string[];

// Increment sync iterators when access map, connection status, or SYNCED languages change.
// Note: this watches the synced subset, NOT the preferred display order — reordering preferred
// languages (display-only) must not trigger a content re-sync; only changing what's downloaded does.
// The access map is only ever replaced whole, so it is watched shallowly: a deep watch would walk
// every group's permissions on each trigger. The language list is spread so in-place edits count.
watch([accessMap, isConnected, () => [...appSyncedLanguageIdsAsRef.value]], () => {
    let accessMapChanged = false;
    const accessMapRaw = toRaw(accessMap.value);
    if (!isEqual(accessMapPrev, accessMapRaw)) {
        accessMapChanged = true;
        accessMapPrev = cloneDeep(accessMapRaw);
    }

    let connectedChanged = false;
    if (isConnectedPrev !== isConnected.value) {
        connectedChanged = true;
        isConnectedPrev = isConnected.value;
    }

    let appLanguagesChanged = false;
    const appLanguageIdsSorted = [...appSyncedLanguageIdsAsRef.value].sort();
    if (!isEqual(appLanguageIdsPrev, appLanguageIdsSorted)) {
        appLanguagesChanged = true;
        appLanguageIdsPrev = appLanguageIdsSorted;
    }

    if (accessMapChanged || connectedChanged) syncIterators.value.language++;
    if (accessMapChanged || connectedChanged || appLanguagesChanged) syncIterators.value.content++;
});

/**
 * Initialize the auth-provider and language document sync watcher.
 */
export function initAuthLangSync() {
    watch(
        () => syncIterators.value.language,
        async () => {
            if (!isConnected.value) {
                setCancelSync(true);
                return;
            }

            setCancelSync(false);

            const access = getAccessibleGroups(AclPermission.View);

            // Sync auth providers
            if (access[DocType.AuthProvider] && access[DocType.AuthProvider].length) {
                sync({
                    type: DocType.AuthProvider,
                    memberOf: access[DocType.AuthProvider],
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    Sentry?.captureException(err);
                });
            }

            // Sync languages
            if (access[DocType.Language] && access[DocType.Language].length) {
                sync({
                    type: DocType.Language,
                    memberOf: access[DocType.Language],
                    limit: 100,
                    cms: false,
                }).catch((err) => {
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
            if (!appSyncedLanguageIdsAsRef.value.length) return;

            const access = getAccessibleGroups(AclPermission.View);

            // Sync post content docs
            if (access[DocType.Post] && access[DocType.Post].length) {
                sync({
                    type: DocType.Content,
                    subType: DocType.Post,
                    memberOf: access[DocType.Post],
                    languages: appSyncedLanguageIdsAsRef.value,
                    limit: 100,
                    cms: false,
                }).catch((err) => {
                    Sentry?.captureException(err);
                });
            }

            // Sync tag content docs
            if (access[DocType.Tag] && access[DocType.Tag].length) {
                sync({
                    type: DocType.Content,
                    subType: DocType.Tag,
                    memberOf: access[DocType.Tag],
                    languages: appSyncedLanguageIdsAsRef.value,
                    limit: 100,
                    cms: false,
                }).catch((err) => {
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
                    Sentry?.captureException(err);
                });
            }

            // Sync the CMS-managed default affinity singleton (recommendation cold-start
            // baseline + tuning config) — previously delivered ad hoc via auth identity.
            if (access[DocType.DefaultAffinity] && access[DocType.DefaultAffinity].length) {
                sync({
                    type: DocType.DefaultAffinity,
                    memberOf: access[DocType.DefaultAffinity],
                    limit: 1,
                    cms: false,
                }).catch((err) => {
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
