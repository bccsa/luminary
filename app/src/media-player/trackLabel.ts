/**
 * What a subtitle or audio track is called in a menu. A master names its tracks as its packager likes
 * (`stream_0`, `track 2`), which says nothing to a viewer; the language says what they will get, in the
 * viewer's own language, as the phone's native player names them. A track with a name of its own
 * (`English SDH`, `Commentary`) keeps it.
 */
const GENERATED = /^(stream|track|sub|subs|subtitle|subtitles|text|audio|caption|captions)[\s_-]*\d*$/i;

export function trackLabel(
    track: { label: string; lang?: string },
    displayLanguage: string,
): string {
    if (!track.lang || (track.label && !GENERATED.test(track.label.trim()))) return track.label;
    try {
        const name = new Intl.DisplayNames([displayLanguage], { type: "language" }).of(track.lang);
        if (name && name.toLowerCase() !== track.lang.toLowerCase()) {
            return name.charAt(0).toLocaleUpperCase(displayLanguage) + name.slice(1);
        }
    } catch {
        /* an unknown code: the label stands */
    }
    return track.label;
}
