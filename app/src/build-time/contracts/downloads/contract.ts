import type { Component, Ref } from "vue";
import type { ContentDto } from "luminary-shared";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/**
 * Where a download stands. `queued` waits its turn; `waiting` keeps its place but cannot transfer until its reason
 * clears by itself; `paused` and `failed` need a resume; `revoked` lost access and cannot play until it returns.
 */
export type DownloadStatus =
    "queued" | "downloading" | "waiting" | "paused" | "complete" | "failed" | "revoked";

/**
 * Why a download is waiting, paused, failed or revoked. A download needs attention when its key is `missing`, or its
 * reason is any of these but `network`, `user` and `access`, unless it is queued, waiting or downloading with only an
 * item refresh left to fetch.
 */
export type DownloadReason =
    | "network"
    | "metered"
    | "volume"
    | "user"
    | "no-space"
    | "interrupted"
    | "source-changed"
    | "source-gone"
    | "integrity"
    | "http"
    | "access";

/** `none` for unencrypted media; `missing` is fixed by fetching the key again, never by downloading again. */
export type DownloadKeyState = "none" | "present" | "missing" | "shredded";

/** The viewer's one choice for the whole download. */
export type DownloadSelection = {
    kind: "audio" | "video";
    angleId?: string;
    qualityId?: string;
    audioLanguage: string;
};

/** A part of the media that is stored or still to come: one chapter's segments. */
export type DownloadUnit = {
    unitId: string;
    state: "pending" | "done";
    bytes: number;
};

/**
 * A chapter in full-item seconds, with the units that together cover it; downloaded when all of them are done, and
 * not planned when there are none (cancelling a pending unit empties the list of every chapter that named it).
 */
export type DownloadChapter = {
    title: string;
    startTime: number;
    endTime: number;
    unitIds: string[];
};

/** What the app keeps of the content with a download, for the Downloads page while the docs are out of reach. */
export type DownloadContentSnapshot = {
    title: string;
    author?: string;
    contentId: string;
    language: string;
    slug?: string;
    memberOf: string[];
    /** Filled in by the engine at start from the media's own length; what the app passes is ignored. */
    durationSeconds: number;
    /** The stored artwork's path inside the download; filled in by the engine when it starts the download. */
    artwork?: string;
    thumbHash?: string;
    publishDate?: number;
    /** The stored media address progress is saved under; a stand-in uses it as its progress id, never as a source. */
    mediaId?: string;
};

/**
 * The words a platform posts in its notifications while the app is not running; any left out, or empty, stay English.
 */
export type DownloadNotificationTexts = {
    title: string;
} & Partial<
    Record<
        | "channel"
        | "alertsChannel"
        | "progress"
        | "queued"
        | "waitingNetwork"
        | "paused"
        | "pause"
        | "cancel"
        | "completed"
        | "failed"
        | "noSpace"
        | "interrupted"
        | "metered"
        | "volume",
        string
    >
>;

/** One download, as the engine stores it: one per parent Post or Tag. */
export type DownloadEntry = {
    downloadId: string;
    parentId: string;
    parentType: "post" | "tag";
    createdAt: number;
    updatedAt: number;
    completedAt: number | null;
    status: DownloadStatus;
    reason: DownloadReason | null;
    queuedAt: number | null;
    selection: DownloadSelection;
    item: { state: "pending" | "done"; bytes: number };
    units: DownloadUnit[];
    chapters: DownloadChapter[];
    volumeId: string;
    encrypted: boolean;
    key: DownloadKeyState;
    expiresAt: number | null;
    revokedAt: number | null;
    lastSourceCheckAt: number | null;
    meteredConsent: boolean;
    content: DownloadContentSnapshot;
};

/** Live transfer figures for a download with work to do. */
export type DownloadProgress = {
    downloadId: string;
    bytesDone: number;
    bytesTotal: number;
    bytesPerSecond: number;
    /** By pending unit id. */
    units: Record<string, number>;
};

export type DownloadNetwork = {
    online: boolean;
    metered: boolean;
};

export type DownloadVolume = {
    id: string;
    kind: "internal" | "card";
    /** The system's name for a card; the app names the internal volume itself and never shows this. */
    label: string;
    /** False while it is out, including a card the engine remembers keeping downloads on. */
    mounted: boolean;
    totalBytes: number;
    freeBytes: number;
    downloadsBytes: number;
    reclaimable: { orphans: number; staging: number; unreferenced: number; expired: number };
};

export type DownloadStorage = {
    volumes: DownloadVolume[];
    /** Space kept free after every download. */
    reserveBytes: number;
    /** Where new downloads go while it is mounted (else `internal`); kept by the engine, `internal` until set. */
    preferredVolumeId: string;
};

/** What the engine can do on this device. */
export type DownloadsCapabilities = {
    /** `progress`: an ongoing notification with pause and cancel; `final`: completed, failed and attention only. */
    notifications: "progress" | "final";
    /**
     * The platform can keep downloads on a card, fixed for the platform. Whether a card is there comes from
     * `storage().volumes`; the location choice shows only when both hold.
     */
    volumes: boolean;
    /** The platform draws the download sheet. */
    sheet: boolean;
    /** Chapters can be downloaded on their own; off, the sheet downloads whole items. */
    sparsePlayback: boolean;
};

/**
 * Where a content's media and its side files are, for planning a download or checking it against the source. The
 * chapters and thumbnails the master names win; these addresses are used only when it names none.
 */
export type DownloadSource = {
    masterUrl: string;
    keyHex?: string;
    chaptersUrl?: string;
    thumbnailsUrl?: string;
    waveformUrl?: string;
    /** The first that answers is stored. */
    artworkUrls: string[];
};

/** One choice in the sheet. */
export type DownloadChoice = { id: string; label: string; detail?: string };

/** What a content can be downloaded as, and how big each choice is, chapter by chapter. */
export type DownloadOptions = {
    kinds: ("audio" | "video")[];
    angles: DownloadChoice[];
    /** By angle id. */
    qualities: Record<string, DownloadChoice[]>;
    languages: DownloadChoice[];
    /** Full-item seconds; empty when the media has no chapters. */
    chapters: { title: string; startTime: number; endTime: number }[];
    /** By selection key: `audio/<language>` or `video/<angleId>/<qualityId>/<language>`. */
    sizes: Record<string, { chapterBytes: number[]; approximate: boolean }>;
    itemBytes: number;
};

/**
 * What the sheet shows; the page sends it whole on every change. While `preparing` or after an `error`, the options
 * are empty and `selection` is the preselection. Every byte value is a whole number, as the engine's options give it;
 * a model with one that is not is malformed and the platform refuses it.
 */
export type DownloadSheetModel = Omit<DownloadOptions, "chapters"> & {
    sheetId: string;
    phase: "preparing" | "ready" | "error";
    message?: string;
    title: string;
    source?: {
        /** The copy that plays while this item is in the player; otherwise the copy the next open will use. */
        current: "downloaded" | "online";
        canDownloaded: boolean;
        canOnline: boolean;
    };
    /** The chapters as the sheet lists them, with what the existing download holds of each. */
    chapters: {
        title: string;
        startTime: number;
        endTime: number;
        state: "none" | "pending" | "done";
    }[];
    selection: DownloadSelection;
    chosen?: number[];
    locked: boolean;
    sparsePlayback: boolean;
    freeBytes: number;
    reserveBytes: number;
    reclaimableBytes: number;
    metered: boolean;
    /** The other downloads on the volume `freeBytes` is for, offered by "Free up space"; none while it is unknown. */
    existing: {
        downloadId: string;
        title: string;
        bytes: number;
        createdAt: number;
        playing: boolean;
    }[];
    download?: { status: DownloadStatus; reason: DownloadReason | null; progress: number };
};

/**
 * What the viewer did in the sheet; `dismissed` says it closed without an action (the viewer closed it, or the screen
 * under it went away).
 */
export type DownloadSheetAction =
    | { action: "start"; selection: DownloadSelection; chapters: number[]; meteredConsent: boolean }
    | { action: "source"; value: "downloaded" | "online" }
    | { action: "delete"; downloadIds: string[] }
    | { action: "cleanUp" }
    | { action: "pause" }
    | { action: "resume"; meteredConsent: boolean }
    | { action: "remove" }
    | { action: "retry" }
    | { action: "dismissed" };

/** The sheet's words; any left out, or empty, stay English. `{size}` is filled in where a text names it. */
export type DownloadSheetTexts = Partial<
    Record<
        | "title"
        | "preparing"
        | "retry"
        | "close"
        | "back"
        | "summary"
        | "change"
        | "kind"
        | "audio"
        | "video"
        | "angle"
        | "quality"
        | "language"
        | "chapters"
        | "allChapters"
        | "chapterDone"
        | "chapterPending"
        | "approximate"
        | "total"
        | "freeSpace"
        | "shortfall"
        | "start"
        | "startMore"
        | "meteredTitle"
        | "meteredMessage"
        | "meteredConfirm"
        | "cancel"
        | "freeUp"
        | "sortOldest"
        | "sortLargest"
        | "selected"
        | "playing"
        | "delete"
        | "cleanUp"
        | "sourceDownloaded"
        | "sourceOnline"
        | "pause"
        | "resume"
        | "remove"
        | "removeTitle"
        | "removeMessage"
        | "removeConfirm"
        | "statusQueued"
        | "statusDownloading"
        | "statusWaiting"
        | "statusWaitingMetered"
        | "statusWaitingVolume"
        | "statusPaused"
        | "statusNoSpace"
        | "statusInterrupted"
        | "statusComplete"
        | "statusFailed"
        | "statusRevoked",
        string
    >
>;

/** One downloaded run of an item: `[fullStart, fullEnd)` of the item plays from `localStart` of the download. */
export type DownloadTimelineSpan = { fullStart: number; fullEnd: number; localStart: number };

/**
 * Full-item time and the time of a download's own, shorter timeline, converted both ways. Supplied by the engine with
 * each session, so every conversion the app makes follows the engine's rules.
 */
export type DownloadTimeline = {
    readonly spans: readonly DownloadTimelineSpan[];
    readonly fullDuration: number;
    readonly localDuration: number;
    /** A position in the full item, on the download's timeline; `exact` is false for a position it does not hold. */
    toLocal(fullTime: number): { local: number; exact: boolean } | undefined;
    toFull(localTime: number): number;
    /** Where playback opens for a saved full-item position, with the usual rewind kept inside its run. */
    resumeLocal(savedFullTime: number): number;
    /** A chapter's times on the download's timeline, and whether the download held it when the session opened. */
    chapter(chapter: { startTime: number; endTime: number; unitIds: string[] }): {
        startTime: number;
        endTime: number;
        available: boolean;
    };
};

/** An opened download, ready for the player. */
export type DownloadPlaybackSession = {
    playbackId: string;
    downloadId: string;
    /** What the player loads instead of the online master; it names the stored chapters and scrub frames itself. */
    masterUrl: string;
    keyHex?: string;
    /** The stored scrub frames, for the player's sidecar in place of the online one. */
    thumbnailsUrl?: string;
    /** The stored loudness curve, for the waveform scrub in place of the online one. */
    waveformUrl?: string;
    /** The stored artwork, for the lock screen and the now-playing screen. */
    artworkUrl?: string;
    timeline: DownloadTimeline;
};

/** What the start of a download, or the addition of chapters to one, needs. */
export type DownloadStartRequest = {
    /** A new id for a new download; the existing one's to add chapters. */
    downloadId: string;
    parentId: string;
    parentType: "post" | "tag";
    source: DownloadSource;
    selection: DownloadSelection;
    /** Indices into the options' chapters; ignored for media without chapters. */
    chapterIndices: number[];
    content: DownloadContentSnapshot;
    texts: DownloadNotificationTexts;
    volumeId: string;
    meteredConsent: boolean;
    expiresAt: number | null;
};

/**
 * What a comparison with the source found and did. Chapter numbers are indices into the source's current chapters;
 * an item without chapters reports its one unit as chapter 0.
 */
export type DownloadSourceCheck = {
    /** Chapters whose media changed: queued to download again. */
    replacedChapters: number[];
    /**
     * Chapters whose media changed while the download is being played: nothing at all was stored, side files included,
     * and the check is not counted, so the next one (when the session closes) finds the same change and replaces them.
     */
    deferredChapters: number[];
    /** Subtitles, chapters, thumbnails or artwork were fetched again. */
    sideFilesRefreshed: boolean;
    /** The source is gone. */
    gone: boolean;
};

export type DownloadRemoveResult = {
    downloadId: string;
    removed: boolean;
    /** Why not: being played, unknown, or a storage failure. */
    code?: "locked" | "unknown-download" | "io";
    freedBytes: number;
};

/** Why the engine stopped a playback session itself. */
export type DownloadPlaybackCloseReason =
    "revoked" | "expired" | "takedown" | "removed" | "volume-unavailable";

/** What the engine reports as it happens. */
export type DownloadsEngineEvents = {
    entry: DownloadEntry;
    progress: DownloadProgress;
    removed: {
        downloadId: string;
        parentId: string;
        reason: "deleted" | "cancelled" | "expired" | "takedown" | "orphan";
    };
    playbackClosed: { playbackId: string; downloadId: string; reason: DownloadPlaybackCloseReason };
    /** A session ended without the engine closing it: the player released it, or `closePlayback` closed it. */
    playbackReleased: { playbackId: string; downloadId: string };
    network: DownloadNetwork;
    /** A volume was mounted or unmounted, or the preferred volume changed. */
    storage: DownloadStorage;
    sheetAction: DownloadSheetAction & { sheetId: string };
    notificationTap: {
        downloadId: string | null;
        kind: "progress" | "completed" | "failed" | "attention";
    };
};

/**
 * Errors an engine call rejects with, as `Error` with `code` set to one of these. Anything else is a failure of the
 * platform itself.
 */
export type DownloadsEngineErrorCode =
    | "unsupported"
    | "invalid-argument"
    | "unknown-download"
    | "already-exists"
    | "locked"
    | "no-space"
    | "volume-unavailable"
    | "key-missing"
    | "key-mismatch"
    | "revoked"
    | "expired"
    | "not-playable"
    | "io"
    /**
     * `options`, `start` or `checkSource`: the source cannot be downloaded as asked (for `start` or `checkSource`, a
     * selection no longer offered).
     */
    | "invalid-source"
    /**
     * `options`, `start` or `checkSource`: a file of the source could not be fetched, or what came back was not it
     * (for `options`, only when no option can be read).
     */
    | "fetch-failed"
    /** `options`, `start` or `checkSource`: the source is encrypted and no key was given. */
    | "key-required"
    /** `options`, `start` or `checkSource`: a file of the source did not decrypt with the key given. */
    | "decrypt-failed";

// ---------------------------------------------------------------------------
// What a build target supplies
// ---------------------------------------------------------------------------

/**
 * The downloads engine of a build target: plain async calls and events, with no Vue and no policy. It plans, stores,
 * transfers, holds keys and plays from disk; every decision about who may keep what, and when, is the service's.
 * A target without downloads supplies none, and the app shows no downloads UI.
 */
export type DownloadsEngine = {
    readonly capabilities: DownloadsCapabilities;
    /**
     * Every download, with live progress for those with work to do. Rejects `io` while stored downloads cannot be
     * read yet (a device not unlocked since it started); the service retries.
     */
    list(): Promise<{ entries: DownloadEntry[]; progress: DownloadProgress[] }>;
    network(): Promise<DownloadNetwork>;
    storage(): Promise<DownloadStorage>;
    /** Where new downloads go; rejects `volume-unavailable` for a volume that is not mounted. */
    setPreferredVolume(volumeId: string): Promise<DownloadStorage>;
    requestNotificationPermission(): Promise<boolean>;
    /**
     * Fetches the master and one media playlist per option, and works out what the sheet offers. Rejects
     * `invalid-source` when any option it sizes has an encrypted segment that is not a multiple of 16. A selection
     * not offered sizes the default selection's item; an option whose playlist cannot be read is left out of `sizes`;
     * when the selection's own playlists cannot be read, the item follows the first readable option in its sound
     * language, then the first readable option at all. Rejects `fetch-failed` only when no option can be read.
     */
    options(source: DownloadSource, selection?: DownloadSelection): Promise<DownloadOptions>;
    /** Plans and starts a new download, or adds chapters to an existing one. */
    start(request: DownloadStartRequest): Promise<DownloadEntry>;
    /**
     * Compares a download with its source, and queues or fetches again whatever changed; replacements of a download
     * being played are deferred, never refused.
     */
    checkSource(downloadId: string, source: DownloadSource): Promise<DownloadSourceCheck>;
    update(
        downloadId: string,
        patch: {
            expiresAt?: number | null;
            content?: DownloadContentSnapshot;
            texts?: DownloadNotificationTexts;
        },
    ): Promise<DownloadEntry>;
    pause(downloadId: string): Promise<DownloadEntry>;
    resume(downloadId: string, options?: { meteredConsent?: boolean }): Promise<DownloadEntry>;
    /** Drops what is still to come; a download with nothing done is removed (null). */
    cancel(downloadId: string): Promise<DownloadEntry | null>;
    remove(
        downloadIds: string[],
        options?: { closePlaying?: boolean },
    ): Promise<DownloadRemoveResult[]>;
    /** Frees orphans, leftovers and expired files; resolves with the bytes freed. */
    cleanUp(): Promise<number>;
    /** Builds the download's playlists and opens a session for the player. */
    openPlayback(downloadId: string): Promise<DownloadPlaybackSession>;
    /** The stored artwork as a `data:` URL, for the Downloads page; undefined when none is stored. */
    artwork(downloadId: string): Promise<string | undefined>;
    /** For a session opened and never loaded; the player releases the ones it loads. */
    closePlayback(playbackId: string): Promise<void>;
    putKey(downloadId: string, keyHex: string): Promise<DownloadEntry>;
    /** Stops playback of it and shreds its key; `expired` and `takedown` also delete the files. */
    revoke(downloadId: string, reason: "access" | "expired" | "takedown"): Promise<void>;
    restore(downloadId: string, keyHex?: string): Promise<DownloadEntry>;
    presentSheet(model: DownloadSheetModel, texts?: DownloadSheetTexts): Promise<void>;
    updateSheet(model: DownloadSheetModel): Promise<void>;
    dismissSheet(sheetId: string): Promise<void>;
    /** Returns the way to stop listening. */
    on<E extends keyof DownloadsEngineEvents>(
        event: E,
        listener: (payload: DownloadsEngineEvents[E]) => void,
    ): () => void;
};

// ---------------------------------------------------------------------------
// What consumers inject
// ---------------------------------------------------------------------------

/** The download state a tile or a tool shows; `percent` is whole, so a tile re-renders at most 100 times. */
export type DownloadBadge =
    | { state: "none" }
    | { state: "unavailable" }
    | { state: "attention" }
    | { state: "progress"; percent: number }
    | { state: "downloaded"; partial: boolean };

/** A download the player is playing from. */
export type DownloadPlayback = {
    readonly downloadId: string;
    readonly playbackId: string;
    readonly masterUrl: string;
    readonly keyHex?: string;
    readonly thumbnailsUrl?: string;
    readonly waveformUrl?: string;
    readonly artworkUrl?: string;
    readonly timeline: DownloadTimeline;
    /** For a session the player never loaded. */
    close(): Promise<void>;
};

/** What the app's player asks of downloads. */
export type DownloadsPlayer = {
    /**
     * The downloaded copy to play, or null for nothing downloaded to play (none, nothing playable, its card out, its
     * key missing, or `preferOnline` while online). A playable download that fails to open while online also resolves
     * null, after the service raised the fallback notice itself; offline it rejects.
     */
    open(content: ContentDto, options: { preferOnline: boolean }): Promise<DownloadPlayback | null>;
    /** More of the item playing became playable since `playback` opened: the player may switch to it. */
    onMoreReady(listener: (parentId: string) => void): () => void;
    /** The engine stopped a session itself (revocation, expiry); the player has already stopped. */
    onClosed(
        listener: (playbackId: string, reason: DownloadPlaybackCloseReason) => void,
    ): () => void;
    /**
     * The viewer picked a source in the download sheet for `parentId`; the player follows it, and answers false (or a
     * promise of false) when it could not, e.g. the download picked did not open. The sheet then shows its error and
     * the switch keeps naming the copy that plays.
     */
    onSourceChosen(
        listener: (
            parentId: string,
            value: "downloaded" | "online",
        ) => boolean | void | Promise<boolean | void>,
    ): () => void;
    /** The source the viewer last picked for `parentId`, which the player opens with as `preferOnline`. */
    sourceOverride(parentId: string): "downloaded" | "online" | undefined;
    /**
     * Shows a notice on the player's own screen: a listener returns true when its screen is showing and it showed
     * the text. A notice no listener showed goes to the app's notifications.
     */
    onNotice(listener: (text: string) => boolean): () => void;
};

/** Components consumers render where downloads appear. */
export type DownloadsUi = {
    /** The badge over a tile; takes `parentId`. */
    DownloadBadge: Component;
    /** "Downloads were interrupted. Resume all", shown at the top of Home while any is. */
    ResumeBanner: Component;
    /** The "also delete downloads (size)" checkbox in the delete-local-data dialog; `v-model` is the choice. */
    DeleteLocalDataOption: Component;
    /** The Downloaded / All switch on the Watch page; `v-model` is whether only downloaded items show. */
    WatchFilterSwitch: Component;
    /**
     * The pill naming the autoplay mode, beside the Autoplay switch and in the end panel; takes `mode` (`"all"` or
     * `"downloaded"`).
     */
    AutoplayModePill: Component;
};

/**
 * What consumers inject: reactive downloads state, the actions on it, the player's hooks, and the components that
 * show it. Absent where the build target supplies no engine; consumers then render nothing of downloads.
 */
export type DownloadsService = {
    readonly capabilities: Readonly<DownloadsCapabilities>;
    /** False until the engine's list has arrived. */
    readonly ready: Readonly<Ref<boolean>>;
    readonly entries: Readonly<Ref<readonly DownloadEntry[]>>;
    /** By download id; only downloads with work to do. */
    readonly progress: Readonly<Ref<ReadonlyMap<string, DownloadProgress>>>;
    /** By parent id. Tiles read their own entry, so a progress tick re-renders only the tiles it changes. */
    readonly badges: Readonly<Ref<ReadonlyMap<string, DownloadBadge>>>;
    /**
     * Parent ids with at least one playable chapter on a mounted volume, for the Watch filter, autoplay's downloaded
     * mode, the up-next badge, the sheet's Downloaded source and the player's choice not to warm the stream for an
     * item likely to play from the device.
     */
    readonly playableParentIds: Readonly<Ref<ReadonlySet<string>>>;
    /** How many downloads need attention. */
    readonly attentionCount: Readonly<Ref<number>>;
    readonly storage: Readonly<Ref<DownloadStorage | null>>;
    readonly network: Readonly<Ref<DownloadNetwork>>;
    entryFor(parentId: string): DownloadEntry | undefined;
    /** Whether `content` may be downloaded now: the access map, the media, and the engine all allow it. */
    eligibility(content: () => ContentDto | undefined): Readonly<Ref<boolean>>;
    /**
     * Presents the download sheet for `content`; `chapter` preselects one chapter alone. `selection` hints what plays;
     * fields the options do not offer are ignored, and an existing download's selection always wins.
     */
    openSheet(
        content: ContentDto,
        options: {
            context: "player" | "downloads";
            chapter?: number;
            selection?: Partial<DownloadSelection>;
        },
    ): Promise<void>;
    pause(downloadId: string): Promise<void>;
    /**
     * Resumes one download, first doing what its failed reason needs (a source check, a takedown re-check). Callers
     * ask the mobile-data question when `network` is metered and pass the answer.
     */
    resume(downloadId: string, options?: { meteredConsent?: boolean }): Promise<void>;
    /**
     * Resumes, as `resume` does each, every `paused` download (the viewer's own pauses too) and every `failed` one,
     * and with `meteredConsent` every `waiting` / `metered` one that is not refreshing. The mobile-data question's
     * size counts exactly this set.
     */
    resumeAll(options?: { meteredConsent?: boolean }): Promise<void>;
    /** Drops the chapters still to come; a download with none done is removed. */
    cancel(downloadId: string): Promise<void>;
    remove(
        downloadIds: string[],
        options?: { closePlaying?: boolean },
    ): Promise<DownloadRemoveResult[]>;
    cleanUp(): Promise<number>;
    refreshStorage(): Promise<void>;
    /** Where new downloads go: `internal` or a mounted card's volume id. Resolves false when the change failed. */
    setPreferredVolume(volumeId: string): Promise<boolean>;
    /** The stored artwork of a download, for its card; undefined when none is stored. */
    artwork(downloadId: string): Promise<string | undefined>;
    readonly player: DownloadsPlayer;
    readonly ui: DownloadsUi;
    readonly lifecycle: {
        /**
         * Re-checks access, expiry and takedowns now, and restores the retention pins of the downloads it finds; also
         * runs on its own at boot, on connect and on foreground.
         */
        recheck(): Promise<void>;
        /** Total bytes on the device, for the delete-local-data dialog. */
        readonly totalBytes: Readonly<Ref<number>>;
        /**
         * Deletes every download except one being played; resolves with the ids not deleted (the one being played,
         * or any the engine could not delete).
         */
        removeAll(): Promise<{ kept: string[] }>;
    };
};
