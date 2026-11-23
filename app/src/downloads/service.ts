import { computed, effectScope, getCurrentScope, shallowRef, watch } from "vue";
import type { ContentDto } from "luminary-shared";
import type {
    DownloadEntry,
    DownloadsEngine,
    DownloadsEngineEvents,
    DownloadsService,
} from "@/build-time/contracts/downloads/contract";
import { contentFromSnapshot, isEligible, storedGroups } from "./content";
import type { DownloadsDeps } from "./deps";
import { resumedByResumeAll } from "./entries";
import { checkFailed, createLifecycle, type Lifecycle } from "./lifecycle";
import { createPlayerHooks, type DownloadsPlayerHooks } from "./player";
import { ACTION_FAILED, createSheetController, UNREADABLE, UPDATED_WHILE_PLAYING } from "./sheet";
import { createDownloadsState, type DownloadsState } from "./state";
import { notificationTexts } from "./texts";
import { downloadsUi } from "./ui";

/** The first retry of a failed list, doubled after each failure up to {@link LIST_RETRY_MAX_MS}. */
export const LIST_RETRY_MS = 5_000;
export const LIST_RETRY_MAX_MS = 5 * 60 * 1000;

/** The service with what the app's own wiring and tests need beyond the contract. */
export type DownloadsRuntime = DownloadsService & {
    readonly player: DownloadsPlayerHooks;
    /** Settles once the engine's list has been applied and the boot checks have run. */
    readonly whenReady: Promise<void>;
    /** A content doc for a download whose doc is not on the device; see {@link contentFromSnapshot}. */
    contentFromSnapshot(entry: DownloadEntry): ContentDto;
    readonly internals: { state: DownloadsState; lifecycle: Lifecycle };
    dispose(): void;
};

type BufferedEvent = {
    [E in keyof DownloadsEngineEvents]: { event: E; payload: DownloadsEngineEvents[E] };
}[keyof DownloadsEngineEvents];

/**
 * Builds the downloads service over an engine: reactive state kept by the engine's events, the sheet, the player's
 * hooks, and the lifecycle that keeps downloads within what the viewer may keep.
 */
export function createDownloadsService(
    engine: DownloadsEngine,
    deps: DownloadsDeps,
): DownloadsRuntime {
    const scope = effectScope(true);
    const state = createDownloadsState();

    const translate = (key: string) => deps.translator()?.t(key);
    // The player's own screen shows a notice first: it covers the web view while it is up.
    const tell = (key: string, kind: "info" | "error" = "info") => {
        const text = translate(key);
        if (text) player.notice(text, kind);
    };

    async function refreshStorage() {
        try {
            state.storage.value = await engine.storage();
        } catch (error) {
            deps.reportError(error, "storage");
        }
    }

    const lifecycle = createLifecycle({ engine, deps, state, tell, refreshStorage });
    const player = createPlayerHooks({ engine, deps, state, lifecycle });

    function forget(downloadId: string, parentId?: string) {
        const entry = state.remove(downloadId);
        if (entry) lifecycle.removed(entry);
        else if (parentId) lifecycle.removed({ parentId, downloadId });
    }

    /** False when the engine refused; the caller tells the viewer. */
    async function pauseDownload(downloadId: string): Promise<boolean> {
        try {
            state.applyEntry(await engine.pause(downloadId));
            return true;
        } catch (error) {
            deps.reportError(error, "pause");
            return false;
        }
    }

    async function pause(downloadId: string) {
        if (!(await pauseDownload(downloadId))) tell(ACTION_FAILED, "error");
    }

    /**
     * False when the download could not be resumed; `quiet` leaves telling the viewer to the caller. A source that
     * turned out gone or changed while being played is no failure: the download's state, or a notice, says why.
     */
    async function resumeDownload(
        downloadId: string,
        options: { meteredConsent?: boolean },
        quiet: boolean,
    ): Promise<boolean> {
        const entry = state.byId(downloadId);
        if (!entry) return true;
        if (entry.status === "failed") {
            if (entry.reason === "source-gone") {
                const outcome = await lifecycle.recheckParent(entry.parentId, { sourceGone: true });
                if (outcome === "takedown" || outcome === "expired") return true;
            }
            if (entry.reason === "source-changed" || entry.reason === "source-gone") {
                const check = await lifecycle.checkSource(entry);
                // Without a check the same plan would fail again.
                if (checkFailed(check)) {
                    if (!quiet) {
                        tell(
                            check.unreadable ? UNREADABLE : "downloads.notice.resume_failed",
                            "error",
                        );
                    }
                    return false;
                }
                if (check.gone) return true;
                // The same plan would fail again; the check when its session closes queues it by itself.
                if (check.deferredChapters.length > 0) {
                    const text = translate(UPDATED_WHILE_PLAYING);
                    if (text) player.notice(text);
                    return true;
                }
            }
        }
        try {
            state.applyEntry(
                await engine.resume(downloadId, {
                    meteredConsent: options.meteredConsent === true,
                }),
            );
            return true;
        } catch (error) {
            deps.reportError(error, "resume");
            const code = (error as { code?: string }).code;
            if (!quiet) {
                tell(
                    code === "no-space"
                        ? "downloads.notice.no_space"
                        : "downloads.notice.resume_failed",
                    "error",
                );
            }
            return false;
        }
    }

    async function resume(downloadId: string, options: { meteredConsent?: boolean } = {}) {
        await resumeDownload(downloadId, options, false);
    }

    async function resumeAll(options: { meteredConsent?: boolean } = {}) {
        const consent = options.meteredConsent === true;
        const resumable = state.entries.value.filter((e) => resumedByResumeAll(e, consent));
        for (const entry of resumable) await resume(entry.downloadId, options);
    }

    async function cancel(downloadId: string) {
        try {
            const kept = await engine.cancel(downloadId);
            if (kept) state.applyEntry(kept);
            else forget(downloadId);
        } catch (error) {
            deps.reportError(error, "cancel");
        }
        await refreshStorage();
    }

    async function remove(downloadIds: string[]) {
        const results = await engine.remove(downloadIds);
        for (const result of results) {
            // The engine holds no such download: nothing of it is left on the device.
            if (result.removed || result.code === "unknown-download") forget(result.downloadId);
        }
        await refreshStorage();
        return results;
    }

    async function cleanUp() {
        const freed = await engine.cleanUp();
        await refreshStorage();
        return freed;
    }

    const sheet = createSheetController({
        engine,
        deps,
        state,
        lifecycle,
        player,
        actions: {
            pause: pauseDownload,
            resume: (downloadId, options) => resumeDownload(downloadId, options, true),
            remove,
            cleanUp,
        },
        tell,
    });

    async function updateTexts() {
        const translator = deps.translator();
        if (!translator) return;
        for (const entry of state.entries.value) {
            if (entry.status === "revoked") continue;
            await engine
                .update(entry.downloadId, {
                    texts: notificationTexts(translator, entry.content.title),
                })
                .catch((error) => deps.reportError(error, "texts"));
        }
    }

    function apply(event: BufferedEvent) {
        switch (event.event) {
            case "entry":
                state.applyEntry(event.payload);
                player.entryChanged(event.payload);
                sheet.refresh();
                break;
            case "progress":
                state.applyProgress(event.payload);
                sheet.progressChanged(event.payload);
                break;
            case "removed":
                forget(event.payload.downloadId, event.payload.parentId);
                void refreshStorage().then(() => sheet.refresh());
                break;
            case "storage":
                state.storage.value = event.payload;
                sheet.refresh();
                break;
            case "network":
                state.network.value = event.payload;
                sheet.refresh();
                break;
            case "playbackClosed":
                player.playbackClosed(event.payload);
                break;
            case "playbackReleased":
                player.playbackReleased(event.payload);
                break;
            case "sheetAction":
                void sheet.handle(event.payload);
                break;
            case "notificationTap":
                deps.navigate("/downloads");
                break;
        }
    }

    // Events that arrive before the list are applied after it, so the list never overwrites something newer.
    let buffer: BufferedEvent[] | null = [];
    const events: (keyof DownloadsEngineEvents)[] = [
        "entry",
        "progress",
        "removed",
        "storage",
        "network",
        "playbackClosed",
        "playbackReleased",
        "sheetAction",
        "notificationTap",
    ];
    const unsubscribers = events.map((event) =>
        engine.on(event, (payload) => {
            const buffered = { event, payload } as BufferedEvent;
            if (buffer) buffer.push(buffered);
            else apply(buffered);
        }),
    );

    let disposed = false;
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    let wakeList: (() => void) | undefined;

    /**
     * Until the list has arrived nothing is known about the downloads, so `ready` stays false and the boot checks
     * wait: reconciling pins against an empty list would release every pin.
     */
    async function loadList(): Promise<void> {
        for (let wait = LIST_RETRY_MS; !disposed; wait = Math.min(wait * 2, LIST_RETRY_MAX_MS)) {
            const [list, storage, network] = await Promise.allSettled([
                engine.list(),
                engine.storage(),
                engine.network(),
            ]);
            if (storage.status === "fulfilled") state.storage.value = storage.value;
            else deps.reportError(storage.reason, "storage");
            if (network.status === "fulfilled") state.network.value = network.value;
            else deps.reportError(network.reason, "network");
            if (list.status === "fulfilled") {
                state.load(list.value.entries, list.value.progress);
                return;
            }
            deps.reportError(list.reason, "list");
            await new Promise<void>((resolve) => {
                wakeList = resolve;
                listTimer = setTimeout(resolve, wait);
            });
            listTimer = wakeList = undefined;
        }
    }

    const whenReady = (async () => {
        await loadList();
        if (disposed) return;
        const pending = buffer ?? [];
        buffer = null;
        pending.forEach(apply);
        state.ready.value = true;
        await lifecycle.boot().catch((error) => deps.reportError(error, "boot"));
    })();

    scope.run(() => {
        watch(
            () => deps.languageKey(),
            () => void updateTexts(),
            { flush: "post" },
        );
        // An open sheet's switch names the copy that plays, which the player changes on its own: it moves to the
        // stream when a session ends, and onto the download when more of it is ready.
        watch(
            () => {
                const now = player.heard.value;
                return now
                    ? `${now.parentId}\n${now.downloadId ?? ""}\n${now.playbackId ?? ""}`
                    : "";
            },
            () => sheet.refresh(),
        );
    });

    function eligibility(content: () => ContentDto | undefined) {
        const groups = shallowRef<readonly string[] | undefined>(undefined);
        const read = async (ids: { parentId: string; contentId: string } | undefined) => {
            groups.value = undefined;
            if (!ids) return;
            const stored = await storedGroups(deps, ids.parentId, ids.contentId);
            const current = content();
            if (current?.parentId !== ids.parentId || current._id !== ids.contentId) return;
            // A doc that is not stored, such as one from a remote answer, carries its parent's groups itself.
            groups.value = stored ?? (current.memberOf?.length ? current.memberOf : undefined);
        };
        // Owned by the caller's scope (a component), so it stops when the caller does.
        const run = getCurrentScope()
            ? <T>(fn: () => T) => fn()
            : <T>(fn: () => T) => scope.run(fn)!;
        run(() =>
            watch(
                () => {
                    const current = content();
                    return current ? `${current.parentId}\n${current._id}` : undefined;
                },
                (key) => {
                    const [parentId, contentId] = key ? key.split("\n") : [];
                    void read(parentId ? { parentId, contentId } : undefined);
                },
                { immediate: true },
            ),
        );
        return computed(() =>
            isEligible(content(), groups.value, deps.accessMap.value, deps.now()),
        );
    }

    const service: DownloadsRuntime = {
        capabilities: engine.capabilities,
        ready: state.ready,
        entries: state.entries,
        progress: state.progress,
        badges: state.badges,
        playableParentIds: state.playableParentIds,
        attentionCount: state.attentionCount,
        storage: state.storage,
        network: state.network,
        entryFor: (parentId) => state.byParent.value.get(parentId),
        eligibility,
        openSheet: (content, options) => sheet.open(content, options),
        pause,
        resume,
        resumeAll,
        cancel,
        remove,
        cleanUp,
        refreshStorage,
        async setPreferredVolume(volumeId) {
            try {
                state.storage.value = await engine.setPreferredVolume(volumeId);
            } catch (error) {
                deps.reportError(error, "preferred-volume");
            }
        },
        artwork: (downloadId) => engine.artwork(downloadId).catch(() => undefined),
        player,
        ui: downloadsUi,
        lifecycle: {
            recheck: () => lifecycle.recheck(),
            totalBytes: lifecycle.totalBytes,
            removeAll: () => lifecycle.removeAll(),
        },
        whenReady,
        contentFromSnapshot,
        internals: { state, lifecycle },
        dispose() {
            disposed = true;
            if (listTimer) clearTimeout(listTimer);
            wakeList?.();
            unsubscribers.forEach((stop) => stop());
            lifecycle.dispose();
            player.dispose();
            scope.stop();
        },
    };
    return service;
}
