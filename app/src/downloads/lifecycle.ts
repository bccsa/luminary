import { computed, effectScope, watch, type ComputedRef } from "vue";
import { DeleteReason, PublishStatus, type ContentDto } from "luminary-shared";
import type {
    DownloadEntry,
    DownloadRemoveResult,
    DownloadSource,
    DownloadSourceCheck,
    DownloadsEngine,
} from "@/build-time/contracts/downloads/contract";
import { sameGroups, storedGroups } from "./content";
import { isAccessMapLoaded, mayDownload, type DownloadsDeps } from "./deps";
import { storedBytes } from "./entries";
import type { DownloadsState } from "./state";

/** Well under the key endpoint's limit, so re-fetching many keys never trips it. */
export const KEY_FETCH_INTERVAL_MS = 5_000;
export const RATE_LIMIT_WAIT_MS = 60_000;
/** Often enough for a moved expiry date to land the same day, at one query per downloaded parent. */
export const EXPIRY_REFRESH_MS = 6 * 60 * 60 * 1000;
/** A burst of deletes or doc writes for one parent is re-checked once. */
export const TAKEDOWN_DEBOUNCE_MS = 2_000;
export const SOURCE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** How long a delete command or a gone source counts towards a takedown. */
export const TAKEDOWN_EVIDENCE_MS = 60 * 60 * 1000;

const TAKEDOWN_REASONS = new Set<DeleteReason>([DeleteReason.Deleted, DeleteReason.StatusChange]);

export type RecheckOutcome = "ok" | "takedown" | "expired" | "unknown" | "none";

/** Engine errors that mean the source itself could not be read, which the viewer is told as such. */
const UNREADABLE_CODES = new Set([
    "invalid-source",
    "fetch-failed",
    "key-required",
    "decrypt-failed",
]);

/** Whether `error` is the engine saying the source could not be read. */
export function isUnreadable(error: unknown): boolean {
    return UNREADABLE_CODES.has((error as { code?: string } | undefined)?.code ?? "");
}

/** A source check that could not run; `unreadable` when the engine could not read the source. */
export type SourceCheckFailure = { failed: true; unreadable: boolean };

export function checkFailed(
    check: DownloadSourceCheck | SourceCheckFailure,
): check is SourceCheckFailure {
    return "failed" in check;
}

export type LifecycleContext = {
    engine: DownloadsEngine;
    deps: DownloadsDeps;
    state: DownloadsState;
    /** Tells the viewer something, in the app's words for `key`. */
    tell(key: string): void;
    refreshStorage(): Promise<void>;
};

export type Lifecycle = {
    /** Runs once the engine's list has arrived. */
    boot(): Promise<void>;
    /** Access, expiry and takedowns for every download now. */
    recheck(): Promise<void>;
    /**
     * Expiry and takedown of one parent's download, from one remote query. `sourceGone` says the engine found the
     * source gone, which counts towards a takedown.
     */
    recheckParent(parentId: string, options?: { sourceGone?: boolean }): Promise<RecheckOutcome>;
    checkAccess(): Promise<void>;
    /**
     * Asks for a download's key again, while the access map grants it; a fetch the player needs goes ahead of the
     * rest.
     */
    queueKeyFetch(downloadId: string, priority?: boolean): void;
    /**
     * Compares a download with its source. Chapters deferred because the download is being played are checked again
     * whenever a session ends, until a check goes through.
     */
    checkSource(
        entry: DownloadEntry,
        from?: { content?: ContentDto; source?: DownloadSource },
    ): Promise<DownloadSourceCheck | SourceCheckFailure>;
    /** The once-a-day check of a downloaded item opened online; runs beside playback. */
    checkOnOpen(entry: DownloadEntry): void;
    /** A playback session ended, so deferred chapters are checked again. */
    sessionClosed(): void;
    started(entry: DownloadEntry): Promise<void>;
    removed(entry: Pick<DownloadEntry, "parentId"> & Partial<DownloadEntry>): void;
    readonly totalBytes: ComputedRef<number>;
    /**
     * Removes every download except one being played; resolves with the ids still on the device, failures included,
     * and the one kept for being played.
     */
    removeAll(): Promise<{ kept: string[]; playing?: string }>;
    dispose(): void;
};

export function createLifecycle(ctx: LifecycleContext): Lifecycle {
    const { engine, deps, state } = ctx;
    const scope = effectScope(true);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribers: (() => void)[] = [];
    let disposed = false;

    const later = (fn: () => void, ms: number) => {
        const timer = setTimeout(() => {
            timers.delete(timer);
            if (!disposed) fn();
        }, ms);
        timers.add(timer);
        return timer;
    };
    const report = (error: unknown, op: string) => deps.reportError(error, op);

    // Counts connections, so an answer can be told apart from one given on an earlier connection.
    let connection = 0;
    scope.run(() =>
        watch(
            deps.isConnected,
            (connected, was) => {
                if (connected && !was) connection++;
            },
            { immediate: true },
        ),
    );

    /** The stored groups of the parent, else the ones the download was made with. */
    async function parentGroups(entry: DownloadEntry): Promise<readonly string[]> {
        return (
            (await storedGroups(deps, entry.parentId, entry.content.contentId)) ??
            entry.content.memberOf
        );
    }

    async function hasAccess(entry: DownloadEntry): Promise<boolean | undefined> {
        const groups = await parentGroups(entry);
        const map = deps.accessMap.value;
        if (!isAccessMapLoaded(map)) return undefined;
        return mayDownload(map, groups, entry.parentType);
    }

    /**
     * An update's result, unless the engine deleted the download meanwhile: it deletes one whose expiry passed on
     * any update, and says so before it answers.
     */
    function applyUpdate(updated: DownloadEntry) {
        if (state.byId(updated.downloadId)) state.applyEntry(updated);
    }

    /** Keeps the snapshot's groups current, so a later check without the stored docs uses today's groups. */
    async function keepGroups(entry: DownloadEntry, groups: readonly string[]) {
        if (sameGroups(groups, entry.content.memberOf)) return;
        try {
            const content = { ...entry.content, memberOf: [...groups] };
            applyUpdate(await engine.update(entry.downloadId, { content }));
        } catch (error) {
            report(error, "update-groups");
        }
    }

    async function revoke(entry: DownloadEntry, reason: "access" | "expired" | "takedown") {
        try {
            await engine.revoke(entry.downloadId, reason);
        } catch (error) {
            report(error, "revoke");
        }
    }

    // ---- key fetches ------------------------------------------------------------------------------------------

    const keyQueue: string[] = [];
    let keyBusy = false;
    let keyTimer: ReturnType<typeof setTimeout> | undefined;
    let nextKeyFetchAt = 0;

    async function restoreUnencrypted(entry: DownloadEntry) {
        if ((await hasAccess(entry)) !== true) return;
        try {
            state.applyEntry(await engine.restore(entry.downloadId));
        } catch (error) {
            report(error, "restore");
        }
    }

    function queueKeyFetch(downloadId: string, priority = false) {
        const entry = state.byId(downloadId);
        if (!entry) return;
        if (!entry.encrypted) {
            // Nothing to fetch: an unencrypted download only needs its access back.
            if (entry.status === "revoked") void restoreUnencrypted(entry);
            return;
        }
        const index = keyQueue.indexOf(downloadId);
        if (index >= 0) {
            if (!priority) return;
            keyQueue.splice(index, 1);
        }
        if (priority) keyQueue.unshift(downloadId);
        else keyQueue.push(downloadId);
        pumpKeys();
    }

    function pumpKeys() {
        if (disposed || keyBusy || keyTimer || keyQueue.length === 0) return;
        const wait = nextKeyFetchAt - deps.now();
        if (wait > 0) {
            keyTimer = later(() => {
                keyTimer = undefined;
                pumpKeys();
            }, wait);
            return;
        }
        const downloadId = keyQueue.shift()!;
        keyBusy = true;
        void fetchKey(downloadId).finally(() => {
            keyBusy = false;
            pumpKeys();
        });
    }

    const needsKey = (entry: DownloadEntry | undefined): entry is DownloadEntry =>
        Boolean(entry && (entry.status === "revoked" || entry.key === "missing"));

    async function fetchKey(downloadId: string) {
        const entry = state.byId(downloadId);
        if (!needsKey(entry)) return;
        // The key endpoint checks View alone, so the map decides whether a key may come back at all.
        if ((await hasAccess(entry)) !== true) return;
        nextKeyFetchAt = deps.now() + KEY_FETCH_INTERVAL_MS;
        let outcome;
        try {
            outcome = await deps.fetchKey(entry.parentId);
        } catch (error) {
            report(error, "fetch-key");
            return;
        }
        if (outcome.outcome === "rateLimited") {
            nextKeyFetchAt = deps.now() + RATE_LIMIT_WAIT_MS;
            if (!keyQueue.includes(downloadId)) keyQueue.unshift(downloadId);
            return;
        }
        // `denied` is left to the access map, and `unreachable` changes nothing.
        if (outcome.outcome !== "key") return;
        // Access may have gone while the key was on its way.
        const latest = state.byId(downloadId);
        if (!needsKey(latest) || (await hasAccess(latest)) !== true) return;
        try {
            const updated =
                latest.status === "revoked"
                    ? await engine.restore(downloadId, outcome.keyHex)
                    : await engine.putKey(downloadId, outcome.keyHex);
            state.applyEntry(updated);
        } catch (error) {
            report(error, "store-key");
        }
    }

    // ---- access ---------------------------------------------------------------------------------------------

    let accessRun: Promise<void> | undefined;
    let accessAgain = false;

    /**
     * Checks one download against the map with `groups` (else its stored groups, else its snapshot's), keeping them
     * in the snapshot first, so a check after the stored docs are gone cannot grant on old groups. Resolves false
     * while the map is not loaded: an empty map means that, never that every grant is gone.
     */
    async function checkEntryAccess(
        downloadId: string,
        groups?: readonly string[],
    ): Promise<boolean> {
        let entry = state.byId(downloadId);
        if (!entry) return true;
        const known = groups ?? (await storedGroups(deps, entry.parentId, entry.content.contentId));
        if (known) {
            await keepGroups(entry, known);
            entry = state.byId(downloadId);
            if (!entry) return true;
        }
        const map = deps.accessMap.value;
        if (!isAccessMapLoaded(map)) return false;
        if (!mayDownload(map, known ?? entry.content.memberOf, entry.parentType)) {
            if (entry.status !== "revoked") await revoke(entry, "access");
            return true;
        }
        if (needsKey(entry)) queueKeyFetch(entry.downloadId);
        return true;
    }

    /** One run at a time; a change during a run starts it over with the newest map. */
    function checkAccess(): Promise<void> {
        if (accessRun) {
            accessAgain = true;
            return accessRun;
        }
        accessRun = (async () => {
            do {
                accessAgain = false;
                for (const { downloadId } of [...state.entries.value]) {
                    if (disposed || accessAgain) break;
                    if (!(await checkEntryAccess(downloadId))) break;
                }
            } while (accessAgain && !disposed);
        })().finally(() => (accessRun = undefined));
        return accessRun;
    }

    /**
     * A group change of a downloaded parent: the access check runs for it at once, before any takedown re-check, so
     * a lost grant revokes for access and keeps the files.
     */
    async function groupsChanged(parentId: string, groups?: readonly string[]) {
        const entry = state.byParent.value.get(parentId);
        if (!entry) return;
        const known = groups ?? (await storedGroups(deps, entry.parentId, entry.content.contentId));
        if (known && !sameGroups(known, entry.content.memberOf)) {
            await checkEntryAccess(entry.downloadId, known);
        }
        scheduleRecheck(parentId);
    }

    // ---- expiry and takedown --------------------------------------------------------------------------------

    // One empty answer is not proof: a takedown also needs a delete command or a gone source for the parent, or
    // the same empty answer again on a later connection.
    const evidence = new Map<string, number>();
    const emptyOnConnection = new Map<string, number>();

    function takedownConfirmed(parentId: string): boolean {
        const seen = evidence.get(parentId);
        if (seen !== undefined && deps.now() - seen < TAKEDOWN_EVIDENCE_MS) return true;
        const first = emptyOnConnection.get(parentId);
        if (first !== undefined && first < connection) return true;
        if (first === undefined) emptyOnConnection.set(parentId, connection);
        return false;
    }

    function forgetTakedown(parentId: string) {
        evidence.delete(parentId);
        emptyOnConnection.delete(parentId);
    }

    async function recheckParent(
        parentId: string,
        options: { sourceGone?: boolean } = {},
    ): Promise<RecheckOutcome> {
        if (!state.byParent.value.get(parentId)) return "none";
        if (options.sourceGone) evidence.set(parentId, deps.now());
        const docs = await deps.queryTranslations(parentId).catch((error) => {
            report(error, "translations");
            return undefined;
        });
        if (!docs) return "unknown";
        const entry = state.byParent.value.get(parentId);
        if (!entry) return "none";

        const published = docs.filter(
            (doc) => doc.parentId === parentId && doc.status === PublishStatus.Published,
        );
        if (published.length === 0) {
            // A viewer without access gets nothing back either; the access map decides that case.
            if ((await hasAccess(entry)) !== true) return "unknown";
            if (!takedownConfirmed(parentId)) return "unknown";
            forgetTakedown(parentId);
            await revoke(entry, "takedown");
            return "takedown";
        }
        forgetTakedown(parentId);
        const expiresAt = published.some((doc) => typeof doc.expiryDate !== "number")
            ? null
            : Math.max(...published.map((doc) => doc.expiryDate as number));
        if (expiresAt !== null && expiresAt <= deps.now()) {
            await revoke(entry, "expired");
            return "expired";
        }
        if (expiresAt !== entry.expiresAt) {
            try {
                applyUpdate(await engine.update(entry.downloadId, { expiresAt }));
            } catch (error) {
                report(error, "update-expiry");
            }
        }
        return "ok";
    }

    let recheckRun: Promise<void> | undefined;
    let recheckAgain = false;

    /** Every download's expiry and takedown, one parent at a time; a call during a run runs it again after. */
    function recheckAll(): Promise<void> {
        if (!deps.isConnected.value) return Promise.resolve();
        if (recheckRun) {
            recheckAgain = true;
            return recheckRun;
        }
        recheckRun = (async () => {
            do {
                recheckAgain = false;
                const parents = [...new Set(state.entries.value.map((e) => e.parentId))];
                for (const parentId of parents) {
                    if (disposed) return;
                    await recheckParent(parentId);
                }
            } while (recheckAgain && !disposed);
        })().finally(() => (recheckRun = undefined));
        return recheckRun;
    }

    const pendingParents = new Map<string, ReturnType<typeof setTimeout>>();
    function scheduleRecheck(parentId: string) {
        if (!state.byParent.value.has(parentId) || pendingParents.has(parentId)) return;
        const timer = later(() => {
            pendingParents.delete(parentId);
            if (deps.isConnected.value) void recheckParent(parentId);
        }, TAKEDOWN_DEBOUNCE_MS);
        pendingParents.set(parentId, timer);
    }

    async function recheck() {
        // Before the list arrives there are no downloads to check, and reconciling would release every pin.
        if (!state.ready.value) return;
        await reconcilePins();
        await checkAccess();
        await recheckAll();
        retryDeferred();
    }

    // ---- source checks --------------------------------------------------------------------------------------

    const deferred = new Set<string>();
    const checking = new Set<string>();

    async function contentOf(entry: DownloadEntry): Promise<ContentDto | undefined> {
        const local = await deps
            .getLocalDoc<ContentDto>(entry.content.contentId)
            .catch(() => undefined);
        if (local) return local;
        const remote = await deps.queryTranslations(entry.parentId).catch(() => undefined);
        return remote?.find((doc) => doc._id === entry.content.contentId);
    }

    async function checkSource(
        entry: DownloadEntry,
        from: { content?: ContentDto; source?: DownloadSource } = {},
    ): Promise<DownloadSourceCheck | SourceCheckFailure> {
        let source = from.source;
        if (!source) {
            const subject = from.content ?? (await contentOf(entry));
            source = subject ? await deps.resolveSource(subject).catch(() => undefined) : undefined;
        }
        if (!source) return { failed: true, unreadable: false };
        let result: DownloadSourceCheck;
        try {
            result = await engine.checkSource(entry.downloadId, source);
        } catch (error) {
            report(error, "check-source");
            return { failed: true, unreadable: isUnreadable(error) };
        }
        if (result.gone) {
            deferred.delete(entry.downloadId);
            await recheckParent(entry.parentId, { sourceGone: true });
            return result;
        }
        if (result.deferredChapters.length > 0) deferred.add(entry.downloadId);
        else deferred.delete(entry.downloadId);
        if (result.replacedChapters.length > 0) ctx.tell("downloads.notice.chapters_replaced");
        return result;
    }

    function retryDeferred() {
        for (const downloadId of [...deferred]) {
            const entry = state.byId(downloadId);
            if (!entry) {
                deferred.delete(downloadId);
                continue;
            }
            if (checking.has(downloadId)) continue;
            checking.add(downloadId);
            void checkSource(entry).finally(() => checking.delete(downloadId));
        }
    }

    /** Downloads already rechecked this session for a picture they were saved without. */
    const artworkAsked = new Set<string>();

    function checkOnOpen(entry: DownloadEntry) {
        if (!state.network.value.online || checking.has(entry.downloadId)) return;
        const last = entry.lastSourceCheckAt;
        // Without a picture the screens show the stand-in offline, so the check that fetches it does not wait a day.
        const missingArtwork = !entry.content.artwork && !artworkAsked.has(entry.downloadId);
        if (missingArtwork) artworkAsked.add(entry.downloadId);
        else if (last !== null && deps.now() - last < SOURCE_CHECK_INTERVAL_MS) return;
        checking.add(entry.downloadId);
        void checkSource(entry).finally(() => checking.delete(entry.downloadId));
    }

    /** Every deferred download is retried, not only the one whose session ended. */
    function sessionClosed() {
        if (deferred.size > 0) retryDeferred();
    }

    // ---- retention pins -------------------------------------------------------------------------------------

    const pinIds = (entry: Pick<DownloadEntry, "parentId"> & Partial<DownloadEntry>) =>
        [entry.parentId, entry.content?.contentId].filter((id): id is string => Boolean(id));

    async function reconcilePins() {
        const wanted = new Set(state.entries.value.flatMap(pinIds));
        try {
            const pinned = new Set(await deps.getPinnedRetentionIds());
            const missing = [...wanted].filter((id) => !pinned.has(id));
            const stale = [...pinned].filter((id) => !wanted.has(id));
            if (missing.length) await deps.pinRetention(missing);
            if (stale.length) await deps.unpinRetention(stale);
        } catch (error) {
            report(error, "pins");
        }
    }

    async function started(entry: DownloadEntry) {
        await deps.pinRetention(pinIds(entry)).catch((error) => report(error, "pin"));
        if (deps.isConnected.value) await recheckParent(entry.parentId);
    }

    function removed(entry: Pick<DownloadEntry, "parentId"> & Partial<DownloadEntry>) {
        deferred.delete(entry.downloadId ?? "");
        forgetTakedown(entry.parentId);
        void deps.unpinRetention(pinIds(entry)).catch((error) => report(error, "unpin"));
    }

    // ---- delete local data ----------------------------------------------------------------------------------

    const totalBytes = computed(() =>
        state.entries.value.reduce(
            (sum, entry) => sum + storedBytes(entry, state.progress.value.get(entry.downloadId)),
            0,
        ),
    );

    async function removeAll(): Promise<{ kept: string[]; playing?: string }> {
        const all = [...state.entries.value];
        if (all.length === 0) return { kept: [] };
        let results: DownloadRemoveResult[];
        try {
            results = await engine.remove(all.map((e) => e.downloadId));
        } catch (error) {
            report(error, "remove-all");
            return { kept: all.map((e) => e.downloadId) };
        }
        const kept: string[] = [];
        let playing: string | undefined;
        for (const result of results) {
            // The engine holds no such download: nothing of it is left on the device.
            if (!result.removed && result.code !== "unknown-download") {
                kept.push(result.downloadId);
                // Only a download being played is kept on purpose; one the engine failed to delete is not.
                if (result.code === "locked") playing = result.downloadId;
                else deps.reportError(new Error(`remove ${result.code ?? "failed"}`), "remove-all");
                continue;
            }
            const entry = state.remove(result.downloadId);
            if (entry) removed(entry);
        }
        await ctx.refreshStorage();
        return playing === undefined ? { kept } : { kept, playing };
    }

    // ---- triggers -------------------------------------------------------------------------------------------

    async function boot() {
        if (disposed) return;
        // Listening first, so a change that lands while the boot checks run is not missed.
        scope.run(() => {
            watch(deps.accessMap, () => void checkAccess(), { deep: true });
            watch(deps.isConnected, (connected, was) => {
                if (connected && !was) void recheck();
            });
        });
        const every = setInterval(() => void recheckAll(), EXPIRY_REFRESH_MS);
        unsubscribers.push(() => clearInterval(every));
        unsubscribers.push(
            deps.onForeground(() => {
                void recheckAll();
                retryDeferred();
            }),
        );
        unsubscribers.push(
            deps.onDocsDeletedByCommand((deleted) => {
                for (const entry of state.entries.value) {
                    const hits = deleted.filter(
                        (doc) =>
                            doc.docId === entry.parentId ||
                            doc.parentId === entry.parentId ||
                            doc.docId === entry.content.contentId,
                    );
                    if (hits.length === 0) continue;
                    // A permission change is decided by the access check against the groups it moved to, never
                    // counted as a takedown.
                    if (hits.some((doc) => TAKEDOWN_REASONS.has(doc.deleteReason))) {
                        evidence.set(entry.parentId, deps.now());
                    }
                    const moved =
                        hits.find(
                            (doc) =>
                                doc.docId === entry.parentId &&
                                doc.deleteReason === DeleteReason.PermissionChange &&
                                doc.newMemberOf,
                        ) ??
                        hits.find(
                            (doc) =>
                                doc.deleteReason === DeleteReason.PermissionChange &&
                                doc.newMemberOf,
                        );
                    if (moved?.newMemberOf) void groupsChanged(entry.parentId, moved.newMemberOf);
                    else scheduleRecheck(entry.parentId);
                }
            }),
        );
        unsubscribers.push(
            deps.watchDocs(
                () => state.entries.value.map((e) => e.parentId),
                (parentIds) => parentIds.forEach((parentId) => void groupsChanged(parentId)),
            ),
        );
        await reconcilePins();
        await checkAccess();
        await recheckAll();
    }

    return {
        boot,
        recheck,
        recheckParent,
        checkAccess,
        queueKeyFetch,
        checkSource,
        checkOnOpen,
        sessionClosed,
        started,
        removed,
        totalBytes,
        removeAll,
        dispose() {
            disposed = true;
            scope.stop();
            timers.forEach(clearTimeout);
            timers.clear();
            unsubscribers.splice(0).forEach((stop) => stop());
        },
    };
}
