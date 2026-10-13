import { computed } from "vue";
import { useI18n } from "vue-i18n";

/**
 * The player's own strings, in the language of the app: the web and the native player take the
 * same keys, and each uses the ones it has. The skip and sleep texts keep their placeholders for
 * the player to fill in with its own numbers.
 */
export function usePlayerMessages() {
    const { t } = useI18n();
    return computed(() => ({
    comingSoon: t("video_player.coming_soon"),
    errorGeneric: t("video_player.error_generic"),
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
    exitFullscreen: t("video_player.exit_fullscreen"),
    audioMenuLabel: t("video_player.audio_menu"),
    subtitlesMenuLabel: t("video_player.subtitles_menu"),
    subtitlesOff: t("video_player.subtitles_off"),
    videoModeLabel: t("video_player.video_mode"),
    audioModeLabel: t("video_player.audio_mode"),
    chapters: t("media_player.chapters"),
    upNext: t("media_player.up_next"),
    browse: t("video_player.browse"),
    closeBrowse: t("video_player.close_browse"),
    nextUp: t("media_player.up_next"),
    dismiss: t("video_player.dismiss_next_up"),
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
    sleepTimer: t("media_player.sleep_timer"),
    sleepOff: t("media_player.sleep_off"),
    sleepMinutes: t("media_player.sleep_minutes", { minutes: "{minutes}" }),
    sleepEndOfChapter: t("media_player.sleep_end_of_chapter"),
    sleepLeft: t("media_player.sleep_left", { minutes: "{minutes}" }),
}));
}
