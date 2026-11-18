import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import { isYouTubeLink } from "@/util/youtube";

/**
 * "recording" and "none" (not an HLS playlist at all) never change; "live" and "offline" can,
 * so those are asked about again.
 */
export type LiveStreamState = "live" | "recording" | "offline" | "none";

const RECHECK_MS = 60_000;

/** Every HLS playlist starts with this tag (RFC 8216 §4.3.1.1). */
export function isPlaylist(body: string): boolean {
    return /^\uFEFF?#EXTM3U/.test(body);
}

/** A media playlist with no end is a live one, the same test the player's HLS engine uses. */
export function isLivePlaylist(playlist: string): boolean {
    return (
        isPlaylist(playlist) &&
        !/#EXT-X-ENDLIST/.test(playlist) &&
        !/#EXT-X-PLAYLIST-TYPE:VOD/.test(playlist)
    );
}

/**
 * Only streams on someone else's CDN can be live: the encoder's own output is stored
 * bucket-relative (`/…`) and is always a recording, and a YouTube link has no playlist to read.
 */
export function canProbeLive(src: string | undefined): src is string {
    return !!src && /^https?:\/\//i.test(src) && !isYouTubeLink(src);
}

function firstVariant(master: string, base: string): string | undefined {
    const lines = master.split(/\r?\n/).map((l) => l.trim());
    const at = lines.findIndex((l) => l.startsWith("#EXT-X-STREAM-INF"));
    if (at < 0) return undefined;
    const uri = lines.slice(at + 1).find((l) => l && !l.startsWith("#"));
    return uri ? new URL(uri, base).href : undefined;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Reads the playlist (and, for a master, its first variant) to tell whether it is on air now. */
export async function probeLiveStream(
    src: string,
    fetchFn: FetchFn = (url, init) => fetch(url, init),
): Promise<LiveStreamState> {
    const read = async (url: string) => {
        const res = await fetchFn(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
    };
    try {
        let playlist = await read(src);
        if (!isPlaylist(playlist)) return "none";
        const variant = firstVariant(playlist, src);
        if (variant) playlist = await read(variant);
        if (!isPlaylist(playlist)) return "none";
        return isLivePlaylist(playlist) ? "live" : "recording";
    } catch {
        return "offline";
    }
}

/** One answer per stream, shared by every tile showing it. A final answer is kept for good. */
const cache = new Map<string, { at: number; final: boolean; state: Promise<LiveStreamState> }>();

const isFinal = (s: LiveStreamState) => s === "recording" || s === "none";

function liveStateOf(src: string): Promise<LiveStreamState> {
    const hit = cache.get(src);
    if (hit && (hit.final || Date.now() - hit.at < RECHECK_MS)) return hit.state;
    const entry = { at: Date.now(), final: false, state: probeLiveStream(src) };
    cache.set(src, entry);
    void entry.state.then((s) => (entry.final = isFinal(s)));
    return entry.state;
}

/** Test hook: forget every answer. */
export function resetLiveStreamCache() {
    cache.clear();
}

/**
 * Whether the stream behind `src` is on air right now. Asked again every minute while the
 * component is mounted, so a tile turns live when a stream starts and back when it ends.
 */
export function useLiveStream(src: () => string | undefined): Ref<boolean> {
    const isLive = ref(false);
    let timer: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
        const url = src();
        if (!canProbeLive(url)) {
            isLive.value = false;
            return;
        }
        const state = await liveStateOf(url);
        if (unmounted || url !== src()) return;
        isLive.value = state === "live";
        if (isFinal(state)) stop();
        else timer ??= setInterval(check, RECHECK_MS);
    };
    const stop = () => {
        clearInterval(timer);
        timer = undefined;
    };
    let unmounted = false;

    onMounted(() => void check());
    watch(src, () => void check());
    onBeforeUnmount(() => {
        unmounted = true;
        stop();
    });

    return isLive;
}
