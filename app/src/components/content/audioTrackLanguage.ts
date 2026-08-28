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
 * Index of the audio track to enable for `languageCode`, or -1 when none matches. Callers
 * MUST treat -1 as "keep the current track" — disabling every track leaves the player with no
 * audio and it stalls once the buffer drains.
 */
export function selectAudioTrackIndex(
    trackLanguages: (string | null | undefined)[],
    languageCode: string | null | undefined,
): number {
    return trackLanguages.findIndex((lang) => matchTrackLanguage(lang, languageCode));
}
