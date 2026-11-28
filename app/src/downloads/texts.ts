import type {
    DownloadNotificationTexts,
    DownloadSheetTexts,
} from "@/build-time/contracts/downloads/contract";

/** The slice of vue-i18n the downloads texts need; a key it does not have comes back unchanged. */
export type Translator = {
    t(key: string, params?: Record<string, unknown>): string;
};

type SheetKey = keyof DownloadSheetTexts;
type NotificationKey = Exclude<keyof DownloadNotificationTexts, "title">;

const SHEET_KEYS: Record<SheetKey, string> = {
    title: "downloads.sheet.title",
    preparing: "downloads.sheet.preparing",
    retry: "downloads.sheet.retry",
    close: "downloads.sheet.close",
    back: "downloads.sheet.back",
    summary: "downloads.sheet.summary",
    change: "downloads.sheet.change",
    kind: "downloads.sheet.kind",
    audio: "downloads.sheet.audio",
    video: "downloads.sheet.video",
    angle: "downloads.sheet.angle",
    quality: "downloads.sheet.quality",
    language: "downloads.sheet.language",
    chapters: "downloads.sheet.chapters",
    allChapters: "downloads.sheet.all_chapters",
    chapterDone: "downloads.sheet.chapter_done",
    chapterPending: "downloads.sheet.chapter_pending",
    approximate: "downloads.sheet.approximate",
    total: "downloads.sheet.total",
    freeSpace: "downloads.sheet.free_space",
    shortfall: "downloads.sheet.shortfall",
    start: "downloads.sheet.start",
    startMore: "downloads.sheet.start_more",
    meteredTitle: "downloads.sheet.metered_title",
    meteredMessage: "downloads.sheet.metered_message",
    meteredConfirm: "downloads.sheet.metered_confirm",
    cancel: "downloads.sheet.cancel",
    freeUp: "downloads.sheet.free_up",
    sortOldest: "downloads.sheet.sort_oldest",
    sortLargest: "downloads.sheet.sort_largest",
    selected: "downloads.sheet.selected",
    playing: "downloads.sheet.playing",
    delete: "downloads.sheet.delete",
    cleanUp: "downloads.sheet.clean_up",
    sourceDownloaded: "downloads.sheet.source_downloaded",
    sourceOnline: "downloads.sheet.source_online",
    pause: "downloads.sheet.pause",
    resume: "downloads.sheet.resume",
    remove: "downloads.sheet.remove",
    removeTitle: "downloads.sheet.remove_title",
    removeMessage: "downloads.sheet.remove_message",
    removeConfirm: "downloads.sheet.remove_confirm",
    statusQueued: "downloads.status.queued",
    statusDownloading: "downloads.status.downloading",
    statusWaiting: "downloads.status.waiting",
    statusWaitingMetered: "downloads.status.waiting_metered",
    statusWaitingVolume: "downloads.status.waiting_volume",
    statusPaused: "downloads.status.paused",
    statusNoSpace: "downloads.status.no_space",
    statusInterrupted: "downloads.status.interrupted",
    statusComplete: "downloads.status.complete",
    statusFailed: "downloads.status.failed",
    statusRevoked: "downloads.status.revoked",
    stepOf: "downloads.sheet.step_of",
    kindStep: "downloads.sheet.kind_step",
    videoQuality: "downloads.sheet.video_quality",
    audioQuality: "downloads.sheet.audio_quality",
    audioOnly: "downloads.sheet.audio_only",
    whatToDownload: "downloads.sheet.what_to_download",
    wholeVideo: "downloads.sheet.whole_video",
    wholeAudio: "downloads.sheet.whole_audio",
    allChaptersCount: "downloads.sheet.all_chapters_count",
    saveTo: "downloads.sheet.save_to",
    phone: "downloads.sheet.phone",
    sdCard: "downloads.sheet.sd_card",
    lastUsed: "downloads.sheet.last_used",
    appLanguage: "downloads.sheet.app_language",
    update: "downloads.sheet.update",
    reopenedHeader: "downloads.sheet.reopened_header",
    reopenedHeaderCard: "downloads.sheet.reopened_header_card",
    redownloadTitle: "downloads.sheet.redownload_title",
    redownloadMessage: "downloads.sheet.redownload_message",
    redownloadConfirm: "downloads.sheet.redownload_confirm",
};

const NOTIFICATION_KEYS: Record<NotificationKey, string> = {
    channel: "downloads.notification.channel",
    alertsChannel: "downloads.notification.alerts_channel",
    progress: "downloads.notification.progress",
    queued: "downloads.notification.queued",
    waitingNetwork: "downloads.notification.waiting_network",
    paused: "downloads.notification.paused",
    pause: "downloads.notification.pause",
    cancel: "downloads.notification.cancel",
    completed: "downloads.notification.completed",
    failed: "downloads.notification.failed",
    noSpace: "downloads.notification.no_space",
    interrupted: "downloads.notification.interrupted",
    metered: "downloads.notification.metered",
    volume: "downloads.notification.volume",
};

/** The now-playing screen's download texts, by the field names of its texts. */
export const NOW_PLAYING_DOWNLOAD_KEYS = {
    download: "downloads.now_playing.download",
    downloadProgress: "downloads.now_playing.download_progress",
    downloaded: "downloads.now_playing.downloaded",
    downloadAttention: "downloads.now_playing.download_attention",
    downloadUnavailable: "downloads.now_playing.download_unavailable",
    sourceDownloaded: "downloads.now_playing.source_downloaded",
    sourceOnline: "downloads.now_playing.source_online",
    chapterNotDownloaded: "downloads.now_playing.chapter_not_downloaded",
    chapterOnline: "downloads.now_playing.chapter_online",
    chapterDownload: "downloads.now_playing.chapter_download",
    autoplayMode: "downloads.now_playing.autoplay_mode",
    autoplayModeAll: "downloads.now_playing.autoplay_mode_all",
    autoplayModeDownloaded: "downloads.now_playing.autoplay_mode_downloaded",
    closeNotice: "downloads.now_playing.close_notice",
    offlinePlaying: "downloads.now_playing.offline_playing",
    autoplayLineAll: "downloads.now_playing.autoplay_line_all",
    autoplayLineDownloaded: "downloads.now_playing.autoplay_line_downloaded",
    autoplayLineOffline: "downloads.now_playing.autoplay_line_offline",
    autoplayNothing: "downloads.now_playing.autoplay_nothing",
    autoplayNothingOffline: "downloads.now_playing.autoplay_nothing_offline",
    autoplayEverything: "downloads.now_playing.autoplay_everything",
    autoplayEverythingDetail: "downloads.now_playing.autoplay_everything_detail",
    autoplayDownloadedCount: "downloads.now_playing.autoplay_downloaded_count",
    qualityAutoDetail: "downloads.now_playing.quality_auto_detail",
    qualityBest: "downloads.now_playing.quality_best",
    qualityGood: "downloads.now_playing.quality_good",
    qualityLeast: "downloads.now_playing.quality_least",
    dataSaverPicks: "downloads.now_playing.data_saver_picks",
    moreHeading: "downloads.now_playing.more_heading",
    moreCount: "downloads.now_playing.more_count",
    moreDownloading: "downloads.now_playing.more_downloading",
} as const;

/**
 * The platform fills these placeholders in itself, in the device's own style, so they are handed over untouched.
 */
const PLACEHOLDERS = {
    size: "{size}",
    title: "{title}",
    percent: "{percent}",
    done: "{done}",
    total: "{total}",
    n: "{n}",
    count: "{count}",
    quality: "{quality}",
};

function collect<K extends string>(
    translator: Translator,
    keys: Record<K, string>,
): Partial<Record<K, string>> {
    const texts: Partial<Record<K, string>> = {};
    for (const [field, key] of Object.entries(keys) as [K, string][]) {
        // A key newer than the language document is left out, so the platform's English stands in rather than the key.
        const text = translator.t(key, PLACEHOLDERS);
        if (text !== key) texts[field] = text;
    }
    return texts;
}

/** The sheet's words in the app's language. */
export function sheetTexts(translator: Translator | undefined): DownloadSheetTexts {
    return translator ? collect(translator, SHEET_KEYS) : {};
}

/** The notification words for a download of the item called `title`. */
export function notificationTexts(
    translator: Translator | undefined,
    title: string,
): DownloadNotificationTexts {
    return { title, ...(translator ? collect(translator, NOTIFICATION_KEYS) : {}) };
}

/** The now-playing screen's download texts in the app's language. */
export function nowPlayingDownloadTexts(
    translator: Translator | undefined,
): Partial<Record<keyof typeof NOW_PLAYING_DOWNLOAD_KEYS, string>> {
    return translator ? collect(translator, NOW_PLAYING_DOWNLOAD_KEYS) : {};
}

/** A byte count for people, in the app's language: "850 MB", "1.2 GB". */
export function formatBytes(bytes: number, locale?: string): string {
    const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit += 1;
    }
    const digits = unit >= 3 && value < 10 ? 1 : 0;
    try {
        return new Intl.NumberFormat(locale, {
            style: "unit",
            unit: units[unit],
            unitDisplay: "short",
            maximumFractionDigits: digits,
        }).format(value);
    } catch {
        return `${value.toFixed(digits)} ${["B", "kB", "MB", "GB", "TB"][unit]}`;
    }
}
