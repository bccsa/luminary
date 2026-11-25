import { computed, shallowRef, type ComputedRef, type ShallowRef } from "vue";
import type { ContentDto } from "luminary-shared";
import type {
    DownloadChapter,
    DownloadEntry,
    DownloadPlayback,
    DownloadPlaybackCloseReason,
    DownloadsEngine,
    DownloadsEngineEvents,
    DownloadsPlayer,
    DownloadTimeline,
} from "@/build-time/contracts/downloads/contract";
import type { DownloadsDeps } from "./deps";
import { chapterState, doneUnitIds, hasPlayableChapter } from "./entries";
import { isVolumeUnmounted } from "./badges";
import type { Lifecycle } from "./lifecycle";
import type { DownloadsState } from "./state";

/** Units that finish this close together become one "more is ready". */
export const MORE_READY_FOLD_MS = 2_000;

/** What the viewer is told when a playable download fails to open while online, and the item streams instead. */
export const STREAMING_FALLBACK = "downloads.notice.streaming_fallback";
const STREAMING_FALLBACK_ENGLISH = "Playing online: the download could not be played";

/** What the player has open: the item, and the download session when it plays from the device. */
export type PlayingItem = {
    parentId: string;
    downloadId?: string;
    playbackId?: string;
    /** Units the session holds (done ones, while it opens), or every unit done when "more is ready" was last reported. */
    done: ReadonlySet<string>;
};

export type DownloadsPlayerHooks = DownloadsPlayer & {
    readonly playing: ShallowRef<PlayingItem | null>;
    /**
     * What the viewer hears: {@link playing}, except while an open replaces a session of the same item, when that
     * session plays on until the open settles.
     */
    readonly heard: ComputedRef<PlayingItem | null>;
    /** The copy the next open of `parentId` will use, as `open` resolves it from the last pick; no side effects. */
    nextSource(parentId: string): "downloaded" | "online";
    /**
     * Sets the override {@link DownloadsPlayer.sourceOverride} answers and tells the `onSourceChosen` listeners.
     * Resolves false when a listener answered false: the player could not follow the pick, so the override is put
     * back and still names the copy that plays.
     */
    chooseSource(parentId: string, value: "downloaded" | "online"): Promise<boolean>;
    /** Gives a notice to the `onNotice` listeners, and to the app's notifications when none showed it. */
    notice(text: string, kind?: "info" | "error"): void;
    entryChanged(entry: DownloadEntry): void;
    playbackClosed(event: DownloadsEngineEvents["playbackClosed"]): void;
    playbackReleased(event: DownloadsEngineEvents["playbackReleased"]): void;
    dispose(): void;
};

export type PlayerContext = {
    engine: DownloadsEngine;
    deps: DownloadsDeps;
    state: DownloadsState;
    lifecycle: Lifecycle;
};

export function createPlayerHooks(ctx: PlayerContext): DownloadsPlayerHooks {
    const { engine, deps, state, lifecycle } = ctx;
    const playing = shallowRef<PlayingItem | null>(null);
    const moreReady = new Set<(parentId: string) => void>();
    const closed = new Set<(playbackId: string, reason: DownloadPlaybackCloseReason) => void>();
    const sourceChosen = new Set<Parameters<DownloadsPlayer["onSourceChosen"]>[0]>();
    const notices = new Set<(text: string) => boolean>();
    const overrides = new Map<string, "downloaded" | "online">();
    // Sessions the engine closed or released: one is never put back as what plays.
    const ended = new Set<string>();
    // The session an open in flight replaces, which plays until that open settles.
    const replacing = shallowRef<PlayingItem | null>(null);
    // Counts opens, so one knows whether a later open took the player while it was in flight.
    let opens = 0;
    let foldTimer: ReturnType<typeof setTimeout> | undefined;

    const listen = <T>(set: Set<T>, listener: T) => {
        set.add(listener);
        return () => void set.delete(listener);
    };

    const endedSession = (item: PlayingItem | null) =>
        !!item?.playbackId && ended.has(item.playbackId);

    function clearPlaying() {
        if (foldTimer) clearTimeout(foldTimer);
        foldTimer = undefined;
        playing.value = null;
    }

    function notice(text: string, kind: "info" | "error" = "info") {
        const shown = Array.from(notices).some((listener) => listener(text));
        if (!shown) deps.notify(text, kind);
    }

    /** The streaming-fallback notice; its English while the language has no words for it. */
    function fallbackText(): string {
        const text = deps.translator()?.t(STREAMING_FALLBACK);
        return text && text !== STREAMING_FALLBACK ? text : STREAMING_FALLBACK_ENGLISH;
    }

    /** Whether `open` plays the download rather than the stream. */
    function opensDownload(entry: DownloadEntry, preferOnline: boolean): boolean {
        if (entry.status === "revoked" || entry.key === "missing") return false;
        if (isVolumeUnmounted(entry, state.storage.value?.volumes ?? [])) return false;
        if (!hasPlayableChapter(entry)) return false;
        if (entry.expiresAt !== null && entry.expiresAt <= deps.now()) return false;
        // Online is honoured only while there is a network to stream from.
        return !(preferOnline && state.network.value.online);
    }

    function playable(entry: DownloadEntry, preferOnline: boolean): boolean {
        if (entry.status !== "revoked" && entry.key === "missing")
            lifecycle.queueKeyFetch(entry.downloadId, true);
        return opensDownload(entry, preferOnline);
    }

    function nextSource(parentId: string): "downloaded" | "online" {
        const entry = state.byParent.value.get(parentId);
        return entry && opensDownload(entry, overrides.get(parentId) === "online")
            ? "downloaded"
            : "online";
    }

    async function open(
        content: ContentDto,
        options: { preferOnline: boolean },
    ): Promise<DownloadPlayback | null> {
        // Whatever played before is gone: the player loads this instead. Its session is released after this load,
        // and the engine reports that. A switch of copy the player declines keeps the copy that plays, so the same
        // item, streamed or from a session, is put back when this one is closed unloaded.
        const before = playing.value;
        // A switch from a session of this item that does not open leaves that session playing: nothing replaced it.
        // An open of this item still in flight hands on the session it was replacing, which still plays.
        const keep =
            before?.parentId === content.parentId
                ? before.playbackId
                    ? before
                    : replacing.value
                : null;
        // What a close of this open's session puts back: what played before it, though another open was in flight.
        const prior = keep ?? before;
        const token = ++opens;
        const latest = () => token === opens;
        replacing.value = keep;
        clearPlaying();
        const entry = state.byParent.value.get(content.parentId);
        const item: PlayingItem = {
            parentId: content.parentId,
            downloadId: entry?.downloadId,
            done: entry ? doneUnitIds(entry) : new Set(),
        };
        playing.value = item;
        const settled = () => {
            if (latest()) replacing.value = null;
        };
        /**
         * Puts back the session of this item that plays, unless another open took the player meanwhile or the engine
         * ended that session during the open.
         */
        const restore = () => {
            settled();
            if (keep && latest() && !endedSession(keep)) playing.value = keep;
        };
        if (!entry) {
            restore();
            return null;
        }

        if (!playable(entry, options.preferOnline)) {
            if (entry.status !== "revoked") lifecycle.checkOnOpen(entry);
            restore();
            return null;
        }
        let session;
        try {
            session = await engine.openPlayback(entry.downloadId);
        } catch (error) {
            deps.reportError(error, "open-playback");
            lifecycle.checkOnOpen(entry);
            const superseded = !latest();
            restore();
            // Offline there is nothing else to play, so the player shows its own error.
            if (!state.network.value.online) throw error;
            // Nothing goes online when another item took over, or the session that plays stays.
            if (superseded || keep) return null;
            // Online the item streams instead, and the viewer is told why.
            notice(fallbackText());
            return null;
        }
        settled();
        // Only a later open supersedes this one: the fold of "more is ready" copies the item in flight.
        if (!latest()) {
            void engine.closePlayback(session.playbackId).catch(() => undefined);
            return null;
        }
        const current = state.byId(entry.downloadId) ?? entry;
        const held = heldUnitIds(current, session.timeline, item.done);
        playing.value = { ...item, playbackId: session.playbackId, done: held };
        // The session may lack a chapter that completed while it opened: that is reported as more becoming ready.
        if (held.size < doneUnitIds(current).size) foldMoreReady(content.parentId, held);
        // Beside playback, after the session opened, so a change found now is deferred rather than replaced under it.
        lifecycle.checkOnOpen(current);

        const playbackId = session.playbackId;
        return {
            downloadId: session.downloadId,
            playbackId,
            masterUrl: session.masterUrl,
            ...(session.keyHex ? { keyHex: session.keyHex } : {}),
            ...(session.thumbnailsUrl ? { thumbnailsUrl: session.thumbnailsUrl } : {}),
            ...(session.waveformUrl ? { waveformUrl: session.waveformUrl } : {}),
            ...(session.artworkUrl ? { artworkUrl: session.artworkUrl } : {}),
            timeline: session.timeline,
            async close() {
                if (playing.value?.playbackId === playbackId) {
                    clearPlaying();
                    if (prior?.parentId === content.parentId && !endedSession(prior))
                        playing.value = prior;
                }
                try {
                    await engine.closePlayback(playbackId);
                } finally {
                    // Checked after the release, so the engine no longer holds the session.
                    lifecycle.sessionClosed();
                }
            },
        };
    }

    function entryChanged(entry: DownloadEntry) {
        const item = playing.value;
        if (!item || item.parentId !== entry.parentId) return;
        if (!item.downloadId) playing.value = { ...item, downloadId: entry.downloadId };
        const done = doneUnitIds(entry);
        if ([...done].some((id) => !item.done.has(id))) foldMoreReady(entry.parentId, done);
    }

    /**
     * Reports "more is ready" once units stop finishing, unless what plays by then holds them all: a session that
     * opened meanwhile may have read them.
     */
    function foldMoreReady(parentId: string, fallback: ReadonlySet<string>) {
        if (foldTimer) return;
        foldTimer = setTimeout(() => {
            foldTimer = undefined;
            const now = playing.value;
            if (!now || now.parentId !== parentId) return;
            const latest = state.byParent.value.get(parentId);
            const done = latest ? doneUnitIds(latest) : fallback;
            playing.value = { ...now, done };
            if (![...done].some((id) => !now.done.has(id))) return;
            for (const listener of Array.from(moreReady)) listener(parentId);
        }, MORE_READY_FOLD_MS);
    }

    /**
     * The done units a session holds. Only a chapter that completed while the session opened can be missing from it:
     * one complete before the open is in the session, even when its timeline reports it unavailable, and counting it
     * as missing would report "more is ready" after every open.
     */
    function heldUnitIds(
        entry: DownloadEntry,
        timeline: DownloadTimeline,
        doneAtOpen: ReadonlySet<string>,
    ): Set<string> {
        const done = doneUnitIds(entry);
        const holds = (chapter: DownloadChapter) => timeline.chapter(chapter).available;
        const lacking = entry.chapters.filter(
            (c) =>
                chapterState(c, done) === "done" &&
                chapterState(c, doneAtOpen) !== "done" &&
                !holds(c),
        );
        if (lacking.length === 0) return done;
        const kept = new Set(entry.chapters.filter(holds).flatMap((c) => c.unitIds));
        for (const id of lacking.flatMap((c) => c.unitIds)) if (!kept.has(id)) done.delete(id);
        return done;
    }

    function playbackClosed(event: DownloadsEngineEvents["playbackClosed"]) {
        for (const listener of Array.from(closed)) listener(event.playbackId, event.reason);
        sessionEnded(event.playbackId);
    }

    /** The item a session of which played stays in the player, now streamed or stopped: no session of it plays. */
    function withoutSession(item: PlayingItem): PlayingItem {
        return {
            parentId: item.parentId,
            ...(item.downloadId ? { downloadId: item.downloadId } : {}),
            done: item.done,
        };
    }

    function sessionEnded(playbackId: string) {
        ended.add(playbackId);
        if (replacing.value?.playbackId === playbackId) replacing.value = null;
        const item = playing.value;
        if (item?.playbackId === playbackId) {
            clearPlaying();
            playing.value = withoutSession(item);
        }
        lifecycle.sessionClosed();
    }

    return {
        open,
        onMoreReady: (listener) => listen(moreReady, listener),
        onClosed: (listener) => listen(closed, listener),
        playing,
        heard: computed(() => {
            const now = playing.value;
            const kept = replacing.value;
            return kept && now?.parentId === kept.parentId && !now.playbackId ? kept : now;
        }),
        nextSource,
        sourceOverride: (parentId) => overrides.get(parentId),
        async chooseSource(parentId, value) {
            const before = overrides.get(parentId);
            overrides.set(parentId, value);
            const answers = await Promise.all(
                Array.from(sourceChosen).map((listener) => listener(parentId, value)),
            );
            if (!answers.includes(false)) {
                // The player loads the stream at once; its session is released only once that load is under way.
                const now = playing.value;
                if (value === "online" && now?.parentId === parentId && now.playbackId)
                    playing.value = withoutSession(now);
                return true;
            }
            // A later pick has its own outcome.
            if (overrides.get(parentId) === value) {
                if (before === undefined) overrides.delete(parentId);
                else overrides.set(parentId, before);
            }
            return false;
        },
        onSourceChosen: (listener) => listen(sourceChosen, listener),
        onNotice: (listener) => listen(notices, listener),
        notice,
        entryChanged,
        playbackClosed,
        playbackReleased: (event) => sessionEnded(event.playbackId),
        dispose() {
            if (foldTimer) clearTimeout(foldTimer);
            foldTimer = undefined;
        },
    };
}
