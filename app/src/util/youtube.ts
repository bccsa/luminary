/**
 * YouTube links, and how Luminary embeds them: only through YouTube's privacy-enhanced domain, and only
 * once the viewer has chosen to play. Same recognition as the player package's `isYouTubeUrl`, kept here so
 * the app can decide before any player exists.
 */

/** `watch?v=`, `/v/`, `/e/`, `/embed/`, a channel-style path with a trailing id, and `youtu.be/`. */
const YOUTUBE_URL =
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;

/** The 11-character video id, or undefined when the link is not a YouTube one. */
export function youTubeIdOf(url: string | null | undefined): string | undefined {
    return url?.match(YOUTUBE_URL)?.[1];
}

export function isYouTubeLink(url: string | null | undefined): boolean {
    return youTubeIdOf(url) !== undefined;
}

/**
 * The embed's address. `youtube-nocookie.com` holds back YouTube's cookies until playback starts;
 * `autoplay` is only ever set once the viewer has pressed Play (or allowed it), and `rel=0` keeps the
 * end screen to this channel's videos.
 */
export function youTubeEmbedUrl(id: string): string {
    return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}

/** Where "Open in YouTube" goes. */
export function youTubeWatchUrl(id: string): string {
    return `https://www.youtube.com/watch?v=${id}`;
}
