import * as iso from "iso-639-2";

/** Whether an audio track's language matches the language the user picked in the app. */
export function matchTrackLanguage(
    trackLanguage: string | null | undefined,
    languageCode: string | null | undefined,
): boolean {
    if (!trackLanguage || !languageCode) return false;

    // Lowercase and drop any country suffix: "en-US" -> "en", "ENG" -> "eng".
    const normalize = (value: string) => value.trim().toLowerCase().split("-")[0];
    const track = normalize(trackLanguage);
    const target = normalize(languageCode);
    if (!track || !target) return false;

    // iOS Safari reports 2-letter codes (e.g. "en"), so compare directly first.
    if (track === target) return true;

    // Android / Chrome report 3-letter codes (e.g. "eng", or the alternate "fre");
    // convert to the 2-letter app code. A language can have two 3-letter codes.
    return iso.iso6392TTo1[track] === target || iso.iso6392BTo1[track] === target;
}

/**
 * The audio track to enable for a language, or null when none matches.
 *
 * Null means "leave the current selection alone", never "disable everything".
 * Audio groups are not always languages — an encode can carry quality tiers (HD,
 * Standard, Bandwidth Saving) with no LANGUAGE attribute at all — and a stream
 * with every track disabled has no audio rendition to fetch, so playback stalls a
 * few seconds in when the buffer runs dry. Whatever the playlist marked DEFAULT is
 * a better answer than silence.
 */
export function pickAudioTrack<T extends { language?: string | null }>(
    tracks: readonly T[],
    languageCode: string | null | undefined,
): T | null {
    for (const track of tracks) {
        if (matchTrackLanguage(track.language, languageCode)) return track;
    }
    return null;
}
