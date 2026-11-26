import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { effectiveDataSaverLevel } from "@/globalConfig";
import type { VideoNowPlayingTexts } from "@/build-time/contracts/video-player/contract";

const DATA_SAVER_LEVEL_NAMES = { off: "Off", light: "Light", strict: "Strict" } as const;

/** The now-playing screen's download words, by its field names; the platform fills in `{percent}` itself. */
const NOW_PLAYING_DOWNLOAD_KEYS = {
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
} as const satisfies Partial<Record<keyof VideoNowPlayingTexts, string>>;

/**
 * Strings that may be newer than the language document: `known` leaves out one the language lacks, so a player's own
 * English stands in rather than the bare key, and `textOr` gives the English passed.
 */
export function useKnownTexts() {
    const { t, te, locale, getLocaleMessage } = useI18n();
    // The language documents' keys are flat with dots in them, which `te` reads as a path and never finds.
    const has = (key: string): boolean => {
        if (te(key)) return true;
        const messages = getLocaleMessage(locale.value) as Record<string, unknown> | undefined;
        return (
            !!messages &&
            Object.prototype.hasOwnProperty.call(messages, key) &&
            typeof messages[key] === "string"
        );
    };
    const known = (key: string, params?: Record<string, string>): string | undefined =>
        has(key) ? (params ? t(key, params) : t(key)) : undefined;
    const textOr = (key: string, english: string, params?: Record<string, string>): string =>
        known(key, params) ?? english;
    return { known, textOr };
}

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip and sleep texts keep their placeholders for
 * the player to fill in with its own numbers.
 */
export function usePlayerMessages() {
    const { t } = useI18n();
    const { known } = useKnownTexts();
    /** "Default from Settings: Light": what the quality menu's Data Saver switch overrides. */
    const dataSaverDefault = (): string => {
        const level = effectiveDataSaverLevel.value;
        const name = known(`settings.data_saver.${level}`) ?? DATA_SAVER_LEVEL_NAMES[level];
        return (
            known("media_player.data_saver_default", { level: name }) ??
            `Default from Settings: ${name}`
        );
    };
    return computed(() => ({
        comingSoon: t("video_player.coming_soon"),
        errorGeneric: t("video_player.error_generic"),
        // The same words as the app's own offline banner.
        offline: t("notification.offline.title"),
        errorUnsupportedBrowser: t("video_player.error_unsupported_browser"),
        errorKeyRequired: t("video_player.error_key_required"),
        errorNetwork: t("video_player.error_network"),
        errorMedia: t("video_player.error_media"),
        retry: t("video_player.retry"),
        play: t("media_player.play"),
        pause: t("media_player.pause"),
        scrubberLabel: t("media_player.seek"),
        elapsedLabel: t("video_player.elapsed"),
        durationLabel: t("video_player.duration"),
        skipBack: t("media_player.skip_back", { seconds: "{seconds}" }),
        skipForward: t("media_player.skip_forward", { seconds: "{seconds}" }),
        chapterOf: t("video_player.chapter_of", { index: "{index}", count: "{count}" }),
        previousChapter: t("media_player.previous_chapter"),
        nextChapter: t("media_player.next_chapter"),
        exitFullscreen: t("video_player.exit_fullscreen"),
        enterFullscreen: t("media_player.fullscreen"),
        lyrics: t("media_player.lyrics"),
        lyricsLanguage: t("media_player.lyrics_language"),
        audioMenuLabel: t("video_player.audio_menu"),
        subtitlesMenuLabel: t("video_player.subtitles_menu"),
        subtitlesOff: t("video_player.subtitles_off"),
        videoModeLabel: t("video_player.video_mode"),
        audioModeLabel: t("video_player.audio_mode"),
        chapters: t("media_player.chapters"),
        upNext: t("media_player.more"),
        browse: t("video_player.browse"),
        closeBrowse: t("video_player.close_browse"),
        nextUp: t("media_player.more"),
        dismiss: t("video_player.dismiss_next_up"),
        closeScrub: t("media_player.close_frames"),

        // Native full-screen draws its own controls and says these.
        pictureInPicture: t("media_player.picture_in_picture"),
        playbackRate: t("media_player.speed"),
        mute: t("media_player.mute"),
        unmute: t("media_player.unmute"),
        loading: t("video_player.loading"),
        qualityLabel: t("video_player.quality_menu"),
        qualityAuto: t("video_player.quality_auto"),
        languageLabel: t("video_player.language_menu"),
        captionsLabel: t("video_player.captions_menu"),
        volumeUp: t("video_player.volume_up"),
        volumeDown: t("video_player.volume_down"),
        speedLabel: t("media_player.speed"),
        live: t("media_player.live"),
        sleepTimer: t("media_player.sleep_timer"),
        sleepOff: t("media_player.sleep_off"),
        sleepMinutes: t("media_player.sleep_minutes", { minutes: "{minutes}" }),
        sleepEndOfChapter: t("media_player.sleep_end_of_chapter"),
        sleepLeft: t("media_player.sleep_left", { minutes: "{minutes}" }),
        dataSaverDefault: dataSaverDefault(),
        ...defined({
            dataSaver: known("media_player.data_saver"),
            autoplay: known("media_player.autoplay"),
            cameraLabel: known("media_player.view"),
            replay: known("media_player.replay"),
            playNow: known("media_player.play_now"),
            cancel: known("media_player.cancel"),
            speedShort: known("media_player.speed_label"),
            sleepShort: known("media_player.sleep_label"),
            more: known("media_player.more"),
            backToLine: known("media_player.back_to_line"),
            // Native full screen reads it after an up-next item that is on the device.
            downloaded: known(NOW_PLAYING_DOWNLOAD_KEYS.downloaded),
        }),
    }));
}

/** The download words of a platform's now-playing screen that the language has; the rest stay the platform's English. */
export function useNowPlayingDownloadTexts() {
    const { known } = useKnownTexts();
    return computed<VideoNowPlayingTexts>(() =>
        defined(
            Object.fromEntries(
                Object.entries(NOW_PLAYING_DOWNLOAD_KEYS).map(([field, key]) => [
                    field,
                    known(key, { percent: "{percent}", count: "{count}", quality: "{quality}" }),
                ]),
            ),
        ),
    );
}

function defined(texts: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(texts).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
}
