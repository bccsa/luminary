import { computed } from "vue";
import { useI18n } from "vue-i18n";

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip and sleep texts keep their placeholders for
 * the player to fill in with its own numbers.
 */
export function usePlayerMessages() {
    const { t, te } = useI18n();
    // Strings newer than a language document are left out, so the player's English stands in rather than the key.
    const known = (key: string): string | undefined => (te(key) ? t(key) : undefined);
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
        }),
    }));
}

function defined(texts: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(texts).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
}
