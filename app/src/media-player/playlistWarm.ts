/**
 * Fetches a video's playlists while its key is still on its way, so the player's own fetches find them in hand.
 *
 * The player reads the master, then every playlist it lists, and only once it has the source, which waits for the
 * key. Started at the same time as the key, the three steps overlap instead of following one another. The player's
 * fetches go through {@link warmFetch}: a URL warmed and not yet taken is answered from here, once; anything else
 * goes to the network as usual.
 *
 * Bodies are kept as the bytes that arrived: a protected video's playlists are encrypted, and only the player can read
 * them. A master that is not plain text is passed on the same way, and what it lists is left to the player.
 */

interface Warmed {
    status: number;
    contentType: string;
    body: ArrayBuffer;
}

/** A warmed answer no load asked for within this long is dropped. */
const KEEP_MS = 30_000;

const warmed = new Map<string, { answer: Promise<Warmed | null>; at: number }>();

function fetchBytes(url: string): Promise<Warmed | null> {
    return fetch(url)
        .then(async (response) =>
            response.ok
                ? {
                      status: response.status,
                      contentType: response.headers.get("content-type") ?? "",
                      body: await response.arrayBuffer(),
                  }
                : null,
        )
        .catch(() => null);
}

function keep(url: string, answer: Promise<Warmed | null>): void {
    warmed.set(url, { answer, at: Date.now() });
    // A failure is not kept: the player asks the network itself and sees the error as it is.
    void answer.then((done) => {
        if (!done && warmed.get(url)?.answer === answer) warmed.delete(url);
    });
}

function attribute(line: string, name: string): string | undefined {
    const match = new RegExp(`(?:^|[:,])${name}=(?:"([^"]*)"|([^,]*))`).exec(line);
    return match ? (match[1] ?? match[2]) : undefined;
}

/**
 * The playlists a master lists, when it is one camera's: with more than one video group the player reads only the
 * chosen camera's, so warming every one would fetch what is never used.
 */
export function playlistsOf(master: string, masterUrl: string): string[] {
    const lines = master.split(/\r?\n/);
    const uris: string[] = [];
    const videoGroups = new Set<string>();
    lines.forEach((raw, i) => {
        const line = raw.trim();
        if (line.startsWith("#EXT-X-STREAM-INF:")) {
            const group = attribute(line, "VIDEO");
            if (group) videoGroups.add(group);
            const next = lines
                .slice(i + 1)
                .find((candidate) => candidate.trim() && !candidate.startsWith("#"));
            if (next) uris.push(next.trim());
        } else if (line.startsWith("#EXT-X-MEDIA:") && attribute(line, "TYPE") === "AUDIO") {
            const uri = attribute(line, "URI");
            if (uri) uris.push(uri);
        }
    });
    if (videoGroups.size > 1) return [];
    return [...new Set(uris)].map((uri) => new URL(uri, masterUrl).href);
}

/** The playlist's text when it is a plain one; null for an encrypted (or any other) body. */
function plainPlaylist(body: ArrayBuffer): string | null {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
    return text.trimStart().startsWith("#EXTM3U") ? text : null;
}

/** Starts fetching `masterUrl` and, once it is in, the playlists it lists. */
export function warmPlaylists(masterUrl: string): void {
    const now = Date.now();
    for (const [url, entry] of warmed) if (now - entry.at > KEEP_MS) warmed.delete(url);
    if (warmed.has(masterUrl)) return;
    const master = fetchBytes(masterUrl);
    keep(masterUrl, master);
    void master.then((done) => {
        const text = done && plainPlaylist(done.body);
        if (!text) return;
        for (const url of playlistsOf(text, masterUrl))
            if (!warmed.has(url)) keep(url, fetchBytes(url));
    });
}

/** `fetch` for the player's controller: a warmed URL is answered from memory, once. */
export const warmFetch: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const entry = warmed.get(url);
    if (!entry || (init?.method && init.method !== "GET")) return fetch(input, init);
    warmed.delete(url);
    return entry.answer.then((done) =>
        done
            ? new Response(done.body.slice(0), {
                  status: done.status,
                  headers: done.contentType ? { "content-type": done.contentType } : {},
              })
            : fetch(input, init),
    );
};
