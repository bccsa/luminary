import { computed, effectScope, ref, watch, type EffectScope, type WatchStopHandle } from "vue";
import type { Table } from "dexie";
import {
    createDataSource,
    db,
    UserActivityType,
    USER_ACTIVITY_SOURCE,
    USER_ACTIVITY_TYPES,
    isUserActivityType,
    reportError,
    useDexieLiveQuery,
    type DataSourceHandle,
    type UserActivityDto,
} from "luminary-shared";
import { notifyUserActivityChanged } from "./state";
import { migrateActivityFormat } from "./migrateActivityFormat";

type UserActivityDatabase = Omit<DataSourceHandle["db"], "docs"> & {
    docs: Table<UserActivityDto, string>;
};

export type UserActivitySource = Omit<DataSourceHandle, "db"> & {
    db: UserActivityDatabase;
};

const OWNER_KEY = "userActivityOwner";
const transportEnabled = ref(false);
const suspended = ref(false);
let openPromise: Promise<UserActivitySource> | null = null;
let initPromise: Promise<void> | null = null;
let sourceHandle: UserActivitySource | null = null;
let observationScope: EffectScope | undefined;
let stopOwnerWatch: WatchStopHandle | undefined;
let stopConsentWatch: WatchStopHandle | undefined;
let authenticated = () => false;
let ownerWork: Promise<void> = Promise.resolve();
let ownerGeneration = 0;

/** Open local storage independently of authentication, consent and server capability. */
export async function getUserActivitySource(): Promise<UserActivitySource> {
    if (!openPromise) {
        openPromise = createDataSource({
            name: USER_ACTIVITY_SOURCE,
            databaseName: "luminary-user-db",
            syncListKey: "syncList:v2",
            docsIndex: "activityTimeUtc,deleted,contentId,[type+activityTimeUtc]",
            sync: {
                type: UserActivityType.Viewed,
                types: USER_ACTIVITY_TYPES,
                memberOf: ["*"],
                limit: 100,
            },
            ready: computed(() => transportEnabled.value && !suspended.value),
            paceMs: 300,
        })
            .then(async (source) => {
                try {
                    await migrateActivityFormat(source.db);
                } catch (error) {
                    await source.dispose();
                    throw error;
                }
                // Keep the shared database generic and type this source's activity-only table.
                const activitySource: UserActivitySource = {
                    ...source,
                    db: Object.assign(source.db, {
                        docs: source.db.table<UserActivityDto, string>("docs"),
                    }),
                };
                sourceHandle = activitySource;
                observationScope = effectScope(true);
                observationScope.run(() => {
                    const docs = useDexieLiveQuery(async () => activitySource.db.docs.toArray(), {
                        initialValue: [],
                    });
                    watch(docs, notifyUserActivityChanged);
                });
                return activitySource;
            })
            .catch((error) => {
                openPromise = null;
                throw error;
            });
    }
    return openPromise;
}

/** Complete local migrations before any component reads or records activity. */
export async function initUserActivitySource(): Promise<void> {
    if (!initPromise) {
        initPromise = (async () => {
            await getUserActivitySource();
            const { userPreferencesAsRef } = await import("@/globalConfig");
            const { migrateUserActivityOnStartup, migrateSeenToUserActivity } =
                await import("./migrate");
            await migrateUserActivityOnStartup(userPreferencesAsRef.value.likes);
            delete userPreferencesAsRef.value.likes;

            const { addMissingUserActivity } = await import("./store");
            const rows = await db.userActivity.toArray();
            // An old article-level tombstone has no passage identity to carry forward.
            const valid = rows.filter((row) => row.type !== "highlighted" || !!row.payload?.range);
            valid.sort((a, b) => Number(a.type === "viewed") - Number(b.type === "viewed"));
            await addMissingUserActivity(valid);
            await db.userActivity.clear();
            await migrateSeenToUserActivity();
            // The marker lives with the data, so clearing a source clears its owner too.
            localStorage.removeItem(OWNER_KEY);
            notifyUserActivityChanged();
        })().catch((error) => {
            initPromise = null;
            throw error;
        });
    }
    return initPromise;
}

/** Run once after setupAuth(), before mounting, for both SPA and web builds. */
export async function setupUserActivitySync(): Promise<void> {
    await initUserActivitySource();
    const source = await getUserActivitySource();
    const { isAuthenticated, user } = await import("@/auth");
    const { userPreferencesAsRef } = await import("@/globalConfig");
    authenticated = () => isAuthenticated.value;
    suspended.value = false;
    const currentOwner = computed(() => {
        const profile = user.value;
        if (!isAuthenticated.value || !profile?.iss || !profile.sub) return null;
        return `${profile.iss}|${profile.sub}`;
    });
    let reconciledOwner: string | null = null;
    const updateGate = () => {
        transportEnabled.value =
            !!currentOwner.value &&
            reconciledOwner === currentOwner.value &&
            userPreferencesAsRef.value.privacyPolicy?.status === "accepted";
    };
    stopOwnerWatch?.();
    stopConsentWatch?.();
    const reconcile = (owner: string | null) => {
        const generation = ++ownerGeneration;
        transportEnabled.value = false;
        reconciledOwner = null;
        ownerWork = ownerWork
            .catch(() => undefined)
            .then(async () => {
                // A lost session retains the data and owner marker for later recovery.
                if (!owner || generation !== ownerGeneration) return;
                const storedOwner = await source.db.getLuminaryInternals(OWNER_KEY);
                if (generation !== ownerGeneration) return;
                if (storedOwner && storedOwner !== owner) await source.clear();
                if (generation !== ownerGeneration) return;
                await source.db.setLuminaryInternals(OWNER_KEY, owner);
                if (generation !== ownerGeneration) return;
                reconciledOwner = owner;
                updateGate();
            });
        void ownerWork.catch((error) => reportError(error, { area: "userActivity", op: "owner" }));
    };
    stopOwnerWatch = watch(currentOwner, reconcile, { immediate: true, flush: "sync" });
    stopConsentWatch = watch(() => userPreferencesAsRef.value.privacyPolicy?.status, updateGate, {
        flush: "sync",
    });
    await ownerWork;
}

export function isUserActivitySignedIn(): boolean {
    return authenticated();
}

export async function flushUserActivity(timeoutMs = 3000): Promise<boolean> {
    return sourceHandle ? sourceHandle.flush(timeoutMs) : true;
}

/** Stop transport before explicit logout clears credentials and data. */
export function suspendUserActivitySync(): void {
    suspended.value = true;
}

export async function clearLocalUserActivity(): Promise<void> {
    const source = await getUserActivitySource();
    await source.clear();
    notifyUserActivityChanged();
}

export async function listSourceUserActivityDocs(): Promise<UserActivityDto[]> {
    const source = await getUserActivitySource();
    return (await source.db.docs.toArray()).filter((doc) => isUserActivityType(doc.type));
}

export async function getSourceUserActivityDoc(id: string): Promise<UserActivityDto | undefined> {
    const source = await getUserActivitySource();
    const doc = await source.db.docs.get(id);
    return doc && isUserActivityType(doc.type) ? doc : undefined;
}

export async function getSourceUserActivityDocs(
    ids: string[],
): Promise<Array<UserActivityDto | undefined>> {
    const source = await getUserActivitySource();
    return source.db.docs.bulkGet(ids);
}

export async function upsertSourceUserActivityDoc(doc: UserActivityDto): Promise<void> {
    const source = await getUserActivitySource();
    await source.db.upsert({ doc, overwriteLocalChanges: true });
}

export async function deleteSourceUserActivityDocs(ids: string[]): Promise<void> {
    const source = await getUserActivitySource();
    await source.db.transaction("rw", source.db.docs, source.db.localChanges, async () => {
        const queued = new Set(
            (await source.db.localChanges.toArray()).map((change) => change.docId),
        );
        await source.db.docs.bulkDelete(ids.filter((id) => !queued.has(id)));
    });
}

/** Release watchers and connections when the application runtime is torn down. */
export async function disposeUserActivitySource(): Promise<void> {
    transportEnabled.value = false;
    ownerGeneration++;
    stopOwnerWatch?.();
    stopConsentWatch?.();
    stopOwnerWatch = undefined;
    stopConsentWatch = undefined;
    await ownerWork.catch(() => undefined);
    observationScope?.stop();
    await sourceHandle?.dispose();
    sourceHandle = null;
    openPromise = null;
    initPromise = null;
    authenticated = () => false;
}
