import { ref, watch } from "vue";
import { findPreferredTrack } from "@luminary-media-converter/player-web";

const STORAGE_KEY = "audioLanguagePreference";

function read(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

/** The language the viewer last switched the audio to, kept across items and restarts; null until they switch. */
export const audioLanguagePreference = ref<string | null>(read());
watch(audioLanguagePreference, (lang) => {
    try {
        if (lang) localStorage.setItem(STORAGE_KEY, lang);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage refused: the choice lasts for this session only.
    }
});

/** The audio language an item opens in: the viewer's last pick where the item has it, else `fallback`. */
export function audioLanguageFor(
    tracks: Parameters<typeof findPreferredTrack>[0],
    fallback: string | undefined,
): string | undefined {
    const remembered = audioLanguagePreference.value;
    return remembered && findPreferredTrack(tracks, remembered) ? remembered : fallback;
}
