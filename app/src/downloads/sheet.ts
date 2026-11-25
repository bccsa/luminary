import { DocType, type ContentDto } from "luminary-shared";
import type {
    DownloadChapter,
    DownloadEntry,
    DownloadOptions,
    DownloadProgress,
    DownloadRemoveResult,
    DownloadSelection,
    DownloadSheetAction,
    DownloadSheetModel,
    DownloadSource,
    DownloadsEngine,
    DownloadVolume,
} from "@/build-time/contracts/downloads/contract";
import { hasDownloadableMedia, isStandIn, snapshotFor, storedGroups } from "./content";
import type { DownloadsDeps } from "./deps";
import { chapterState, displayedStatus, doneUnitIds, storedBytes } from "./entries";
import { checkFailed, isUnreadable, type Lifecycle } from "./lifecycle";
import type { DownloadsPlayerHooks } from "./player";
import type { DownloadsState } from "./state";
import { notificationTexts, sheetTexts } from "./texts";

export type SheetContext = {
    engine: DownloadsEngine;
    deps: DownloadsDeps;
    state: DownloadsState;
    lifecycle: Lifecycle;
    player: DownloadsPlayerHooks;
    /** Tells the viewer something, in the app's words for `key`. */
    tell(key: string, state?: "info" | "error"): void;
    /** What the sheet's manage row and "Free up space" do; pause and resume resolve false when they fail. */
    actions: {
        pause(downloadId: string): Promise<boolean>;
        resume(downloadId: string, options: { meteredConsent: boolean }): Promise<boolean>;
        remove(
            downloadIds: string[],
            options?: { closePlaying?: boolean },
        ): Promise<DownloadRemoveResult[]>;
        cleanUp(): Promise<number>;
    };
};

type OpenSheet = {
    sheetId: string;
    content: ContentDto;
    context: "player" | "downloads";
    chapter?: number;
    phase: DownloadSheetModel["phase"];
    message?: string;
    selection: DownloadSelection;
    /** What plays, for the preselection of a new download. */
    hint: Partial<DownloadSelection>;
    options?: DownloadOptions;
    source?: DownloadSource;
    /** The last whole percent sent, so a progress tick resends the model only when the row changes. */
    sentPercent?: number;
};

export type SheetOptions = {
    context: "player" | "downloads";
    chapter?: number;
    selection?: Partial<DownloadSelection>;
};

export type SheetController = {
    open(content: ContentDto, options: SheetOptions): Promise<void>;
    handle(action: DownloadSheetAction & { sheetId: string }): Promise<void>;
    /** The download or the device changed: an open sheet is sent again. */
    refresh(): void;
    progressChanged(progress: DownloadProgress): void;
};

export const UPDATED_WHILE_PLAYING = "downloads.notice.updated_while_playing";
/** What the viewer is told when an action of the sheet, or the same action on the Downloads page, failed. */
export const ACTION_FAILED = "downloads.sheet.action_failed";
/** What the viewer is told when a download it removed is kept because it is playing. */
export const KEPT_PLAYING = "downloads.notice.kept_playing";
/** What the viewer is told when the engine could not read the source. */
export const UNREADABLE = "downloads.notice.unreadable";

/** A new download's id: random, so a deleted and re-added item never meets its old key. */
export function newDownloadId(): string {
    return crypto.randomUUID().replace(/-/g, "");
}

const reclaimable = (volume: DownloadVolume | undefined) =>
    volume
        ? volume.reclaimable.orphans +
          volume.reclaimable.staging +
          volume.reclaimable.unreferenced +
          volume.reclaimable.expired
        : 0;

function selectionKey(selection: DownloadSelection): string {
    return selection.kind === "audio"
        ? `audio/${selection.audioLanguage}`
        : `video/${selection.angleId}/${selection.qualityId}/${selection.audioLanguage}`;
}

/** The hint where the options offer it, else the first offered choice at each step. */
export function preselect(
    options: DownloadOptions,
    hint: Partial<DownloadSelection>,
): DownloadSelection {
    const languages = options.languages.map((l) => l.id);
    const kinds = hint.kind && options.kinds.includes(hint.kind) ? [hint.kind] : [];
    const candidates: DownloadSelection[] = [];
    for (const kind of [...kinds, ...options.kinds]) {
        const orderedLanguages = [
            ...(hint.audioLanguage && languages.includes(hint.audioLanguage)
                ? [hint.audioLanguage]
                : []),
            ...languages,
        ];
        for (const audioLanguage of orderedLanguages) {
            if (kind === "audio") {
                candidates.push({ kind, audioLanguage });
                continue;
            }
            const angles = [
                ...options.angles.filter((a) => a.id === hint.angleId),
                ...options.angles,
            ];
            for (const angle of angles) {
                const qualities = options.qualities[angle.id] ?? [];
                const ordered = [...qualities.filter((q) => q.id === hint.qualityId), ...qualities];
                for (const quality of ordered) {
                    candidates.push({
                        kind,
                        angleId: angle.id,
                        qualityId: quality.id,
                        audioLanguage,
                    });
                }
            }
        }
    }
    return (
        candidates.find((c) => options.sizes[selectionKey(c)]) ??
        candidates[0] ?? { kind: "audio", audioLanguage: languages[0] ?? "" }
    );
}

/** The preselection while the options are on their way: the hint as it stands. */
function hintedSelection(hint: Partial<DownloadSelection>): DownloadSelection {
    const kind = hint.kind ?? "video";
    return {
        kind,
        ...(kind === "video" && hint.angleId ? { angleId: hint.angleId } : {}),
        ...(kind === "video" && hint.qualityId ? { qualityId: hint.qualityId } : {}),
        audioLanguage: hint.audioLanguage ?? "",
    };
}

/** The chapter of the download that matches the sheet's `index`th chapter. */
function matchChapter(
    entry: DownloadEntry,
    chapter: { startTime: number },
    index: number,
    count: number,
): DownloadChapter | undefined {
    if (entry.chapters.length === count) return entry.chapters[index];
    return entry.chapters.find((c) => c.startTime === chapter.startTime);
}

/**
 * The options of a download whose content cannot be reached, built from what it holds, so it can still be managed.
 * Chapters it never planned can be listed but not added.
 */
function optionsFromEntry(entry: DownloadEntry): DownloadOptions {
    const chapterBytes = entry.chapters.map((c) =>
        entry.units.filter((u) => c.unitIds.includes(u.unitId)).reduce((s, u) => s + u.bytes, 0),
    );
    const sel = entry.selection;
    return {
        kinds: [sel.kind],
        angles: sel.angleId ? [{ id: sel.angleId, label: sel.angleId }] : [],
        qualities:
            sel.angleId && sel.qualityId
                ? { [sel.angleId]: [{ id: sel.qualityId, label: sel.qualityId }] }
                : {},
        languages: [{ id: sel.audioLanguage, label: sel.audioLanguage }],
        chapters: entry.chapters.map(({ title, startTime, endTime }) => ({
            title,
            startTime,
            endTime,
        })),
        sizes: { [selectionKey(sel)]: { chapterBytes, approximate: false } },
        itemBytes: entry.item.bytes,
    };
}

export function createSheetController(ctx: SheetContext): SheetController {
    const { engine, deps, state, lifecycle, player } = ctx;
    let current: OpenSheet | null = null;

    const entryOf = (sheet: OpenSheet) => state.byParent.value.get(sheet.content.parentId);

    function volumeFor(entry: DownloadEntry | undefined): DownloadVolume | undefined {
        const volumes = state.storage.value?.volumes ?? [];
        if (entry) return volumes.find((v) => v.id === entry.volumeId);
        const preferred = volumes.find((v) => v.id === state.storage.value?.preferredVolumeId);
        return preferred?.mounted ? preferred : volumes.find((v) => v.id === "internal");
    }

    function model(sheet: OpenSheet): DownloadSheetModel {
        const entry = entryOf(sheet);
        const options = sheet.phase === "ready" ? sheet.options : undefined;
        const done = entry ? doneUnitIds(entry) : new Set<string>();
        const count = options?.chapters.length ?? 0;
        const volume = volumeFor(entry);
        const now = player.heard.value;
        const parentId = sheet.content.parentId;
        const progress = entry ? state.progress.value.get(entry.downloadId) : undefined;
        return {
            kinds: options?.kinds ?? [],
            angles: options?.angles ?? [],
            qualities: options?.qualities ?? {},
            languages: options?.languages ?? [],
            sizes: options?.sizes ?? {},
            itemBytes: options?.itemBytes ?? 0,
            sheetId: sheet.sheetId,
            phase: sheet.phase,
            ...(sheet.message ? { message: sheet.message } : {}),
            title: sheet.content.title,
            ...(sheet.context === "player"
                ? {
                      source: {
                          // What plays wins over the last pick: the player can move to the stream on its own.
                          current:
                              now?.parentId === parentId
                                  ? now.playbackId
                                      ? "downloaded"
                                      : "online"
                                  : player.nextSource(parentId),
                          canDownloaded: state.playableParentIds.value.has(parentId),
                          canOnline:
                              state.network.value.online && hasDownloadableMedia(sheet.content),
                      },
                  }
                : {}),
            chapters: (options?.chapters ?? []).map((chapter, index) => ({
                ...chapter,
                state: entry
                    ? chapterState(matchChapter(entry, chapter, index, count), done)
                    : "none",
            })),
            selection: sheet.selection,
            ...(sheet.chapter !== undefined ? { chosen: [sheet.chapter] } : {}),
            locked: Boolean(entry),
            sparsePlayback: engine.capabilities.sparsePlayback,
            freeBytes: volume?.freeBytes ?? 0,
            reserveBytes: state.storage.value?.reserveBytes ?? 0,
            reclaimableBytes: reclaimable(volume),
            metered: state.network.value.metered,
            // Deleting a download on another volume frees nothing where this one goes.
            existing: state.entries.value
                .filter(
                    (e) =>
                        volume !== undefined && e.volumeId === volume.id && e.parentId !== parentId,
                )
                .map((e) => ({
                    downloadId: e.downloadId,
                    title: e.content.title,
                    bytes: storedBytes(e, state.progress.value.get(e.downloadId)),
                    createdAt: e.createdAt,
                    playing: Boolean(now?.playbackId && now.downloadId === e.downloadId),
                })),
            ...(entry ? { download: displayedStatus(entry, progress) } : {}),
        };
    }

    async function send(sheet: OpenSheet) {
        if (current !== sheet) return;
        const sent = model(sheet);
        sheet.sentPercent = Math.floor((sent.download?.progress ?? 0) * 100);
        await engine.updateSheet(sent).catch((error) => deps.reportError(error, "sheet"));
    }

    async function prepare(sheet: OpenSheet) {
        sheet.phase = "preparing";
        sheet.message = undefined;
        sheet.source = undefined;
        try {
            if (!hasDownloadableMedia(sheet.content)) throw new Error("nothing to download");
            const source = await deps.resolveSource(sheet.content);
            if (!source) throw new Error("no source");
            const options = await engine.options(source, entryOf(sheet)?.selection);
            const entry = entryOf(sheet);
            sheet.source = source;
            sheet.options = options;
            sheet.selection = entry ? entry.selection : preselect(options, sheet.hint);
            sheet.phase = "ready";
        } catch (error) {
            const entry = entryOf(sheet);
            if (entry) {
                // Offline, or with the content out of reach, a download is still managed from what it holds.
                // Without a source nothing can be added.
                sheet.options = optionsFromEntry(entry);
                sheet.selection = entry.selection;
                sheet.phase = "ready";
            } else {
                deps.reportError(error, "sheet-options");
                sheet.phase = "error";
                sheet.message = deps
                    .translator()
                    ?.t(
                        isUnreadable(error)
                            ? "downloads.sheet.unreadable"
                            : "downloads.sheet.error",
                    );
            }
        }
        await send(sheet);
    }

    async function open(content: ContentDto, options: SheetOptions) {
        if (!engine.capabilities.sheet) return;
        const entry = state.byParent.value.get(content.parentId);
        const hint = options.selection ?? {};
        const sheet: OpenSheet = {
            sheetId: newDownloadId(),
            content,
            context: options.context,
            ...(options.chapter !== undefined ? { chapter: options.chapter } : {}),
            phase: "preparing",
            selection: entry?.selection ?? hintedSelection(hint),
            hint,
        };
        current = sheet;
        try {
            const now = player.heard.value;
            const playing = Boolean(now?.playbackId && now.parentId === content.parentId);
            await engine.presentSheet(model(sheet), sheetTexts(deps.translator(), { playing }));
        } catch (error) {
            deps.reportError(error, "present-sheet");
            current = null;
            return;
        }
        await prepare(sheet);
    }

    async function start(
        sheet: OpenSheet,
        action: Extract<DownloadSheetAction, { action: "start" }>,
    ) {
        const content = sheet.content;
        const entry = entryOf(sheet);
        if (!sheet.source || isStandIn(content)) {
            ctx.tell("downloads.notice.start_failed", "error");
            return;
        }
        if (entry) {
            // An add planned from a changed source would sit beside the old source's files, so no check, no add.
            const check = await lifecycle.checkSource(entry, { content, source: sheet.source });
            if (checkFailed(check)) {
                ctx.tell(check.unreadable ? UNREADABLE : "downloads.notice.start_failed", "error");
                return;
            }
            if (check.gone) {
                const after = state.byId(entry.downloadId);
                ctx.tell(
                    !after || after.status === "revoked"
                        ? "downloads.notice.revoked"
                        : "downloads.notice.start_failed",
                    "error",
                );
                return;
            }
            if (check.deferredChapters.length > 0) {
                const text = deps.translator()?.t(UPDATED_WHILE_PLAYING);
                if (text) player.notice(text);
                return;
            }
        }
        const stored = await storedGroups(deps, content.parentId, content._id);
        const groups = stored ?? (content.memberOf?.length ? content.memberOf : undefined);
        // A download kept without its groups would be revoked by the first access check.
        if (!groups) {
            ctx.tell("downloads.notice.start_failed", "error");
            return;
        }
        // The first download is when the viewer learns why notifications are wanted.
        if (state.entries.value.length === 0) {
            await engine.requestNotificationPermission().catch(() => false);
        }
        const latest = entryOf(sheet);
        const volumeId = latest?.volumeId ?? volumeFor(undefined)?.id ?? "internal";
        try {
            const started = await engine.start({
                downloadId: latest?.downloadId ?? newDownloadId(),
                parentId: content.parentId,
                parentType: content.parentType === DocType.Tag ? "tag" : "post",
                source: sheet.source,
                selection: action.selection,
                chapterIndices: action.chapters,
                content: snapshotFor(content, groups),
                texts: notificationTexts(deps.translator(), content.title),
                volumeId,
                meteredConsent: action.meteredConsent,
                expiresAt: latest ? latest.expiresAt : (content.expiryDate ?? null),
            });
            state.applyEntry(started);
            await lifecycle.started(started);
        } catch (error) {
            deps.reportError(error, "start");
            const code = (error as { code?: string }).code;
            ctx.tell(
                code === "no-space"
                    ? "downloads.notice.no_space"
                    : isUnreadable(error)
                      ? UNREADABLE
                      : "downloads.notice.start_failed",
                "error",
            );
        }
    }

    async function handle(action: DownloadSheetAction & { sheetId: string }) {
        const sheet = current;
        // An action from a sheet no longer shown is stale.
        if (!sheet || action.sheetId !== sheet.sheetId) return;
        const entry = entryOf(sheet);
        let done = true;
        switch (action.action) {
            case "start":
                current = null;
                await start(sheet, action);
                return;
            case "dismissed":
                current = null;
                return;
            case "retry":
                // The spinner shows again at once, rather than the error until the options arrive.
                sheet.phase = "preparing";
                sheet.message = undefined;
                await send(sheet);
                await prepare(sheet);
                return;
            case "source":
                done = await player
                    .chooseSource(sheet.content.parentId, action.value)
                    .catch((error) => {
                        deps.reportError(error, "sheet-source");
                        return false;
                    });
                break;
            case "delete":
                done = await removed(action.downloadIds, "sheet-delete");
                break;
            case "cleanUp":
                done = await ctx.actions.cleanUp().then(
                    () => true,
                    (error) => {
                        deps.reportError(error, "clean-up");
                        return false;
                    },
                );
                break;
            case "pause":
                if (entry) done = await ctx.actions.pause(entry.downloadId);
                break;
            case "resume":
                if (entry) {
                    done = await ctx.actions.resume(entry.downloadId, {
                        meteredConsent: action.meteredConsent,
                    });
                }
                break;
            case "remove":
                if (entry) done = await removed([entry.downloadId], "sheet-remove", true);
                break;
        }
        // A failure shows in the sheet, whose Retry builds the model again as at opening.
        if (!done && current === sheet) {
            sheet.phase = "error";
            sheet.message = deps.translator()?.t(ACTION_FAILED);
        }
        // Sent again whatever the outcome, so the sheet shows the state as it is.
        await send(sheet);
    }

    /**
     * Whether every download named is gone; one the engine does not hold counts as gone. One being played is kept on
     * purpose, which is no failure: the viewer is told it was kept.
     */
    async function removed(
        downloadIds: string[],
        op: string,
        closePlaying = false,
    ): Promise<boolean> {
        try {
            const results = await ctx.actions.remove(
                downloadIds,
                closePlaying ? { closePlaying: true } : undefined,
            );
            if (results.some((r) => r.code === "locked")) ctx.tell(KEPT_PLAYING);
            return results.every(
                (r) => r.removed || r.code === "unknown-download" || r.code === "locked",
            );
        } catch (error) {
            deps.reportError(error, op);
            return false;
        }
    }

    return {
        open,
        handle,
        refresh() {
            if (current && current.phase !== "preparing") void send(current);
        },
        progressChanged(progress) {
            const sheet = current;
            if (!sheet || sheet.phase !== "ready") return;
            const entry = entryOf(sheet);
            if (entry?.downloadId !== progress.downloadId) return;
            const percent = Math.floor(displayedStatus(entry, progress).progress * 100);
            if (percent !== sheet.sentPercent) void send(sheet);
        },
    };
}
