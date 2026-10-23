/**
 * The script of `youtube-embed.html`, the page the app frames to play a YouTube video. YouTube refuses an embed
 * (error 153) when the page holding it has no proper address to report, which is what an app's own page has; this
 * page is served from the web app's real HTTPS address, so YouTube sees that one. The web app frames it too, so
 * YouTube looks and behaves the same everywhere. It is only ever opened after the viewer chose to play, with `?v=`
 * the 11-character video id.
 *
 * Two modes. Plain (`?v=ID`): the embed itself, with YouTube's controls. Driven (`?v=ID&api=1`): YouTube's IFrame
 * Player API with its controls off, reporting to the page that frames this one and taking play, pause, seek, speed
 * and mute from it, so the app's own controls work on the video. The API's script is loaded here, from
 * youtube.com, and only in the driven mode.
 *
 * Messages both ways are JSON with `src: "lmc-yt"`. Out: `ready`, `state`, `time`, `error`, and `exit` (leave
 * full-screen). In: `cmd` of `play`, `pause`, `seek`, `rate`, `mute`, `unmute`, `snapshot`, `fullscreen`. In
 * full-screen this page draws its own controls over the video.
 *
 * Built and minified into the page by `vite-plugins/youtubeEmbedPage.ts`.
 */

/** The part of YouTube's IFrame Player API this page uses. */
interface YouTubePlayer {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    setPlaybackRate(rate: number): void;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    getPlayerState(): number;
    getCurrentTime(): number;
    getDuration(): number;
    getVideoLoadedFraction(): number;
    getPlaybackRate(): number;
}

declare global {
    interface Window {
        onYouTubeIframeAPIReady?: () => void;
        YT?: { Player: new (element: string, options: Record<string, unknown>) => YouTubePlayer };
    }
}

type Snapshot = {
    type?: string;
    status?: number;
    currentTime?: number;
    duration?: number;
    loaded?: number;
    rate?: number;
    muted?: boolean;
};

const PLAYING = 1;
const BUFFERING = 3;

const query = new URLSearchParams(location.search);
const id = query.get("v") ?? "";
const host = "https://www.youtube-nocookie.com";

const byId = <T extends HTMLElement>(name: string): T => document.getElementById(name) as T;

// The play triangle's weight sits left of its box: moved right so it looks centred in its circle.
const PLAY = [
    "m14.051 10.723-7.985 4.964a1.98 1.98 0 0 1-2.758-.638A2.06 2.06 0 0 1 3 13.964V4.036C3 2.91 3.895 2 5 2c.377 0 .747.109 1.066.313l7.985 4.964a2.057 2.057 0 0 1 .627 2.808c-.16.257-.373.475-.627.637",
];
const PAUSE = [
    "M3.75 2h1.5a1.75 1.75 0 0 1 1.75 1.75v10.5a1.75 1.75 0 0 1 -1.75 1.75h-1.5a1.75 1.75 0 0 1 -1.75 -1.75v-10.5a1.75 1.75 0 0 1 1.75 -1.75z",
    "M12.75 2h1.5a1.75 1.75 0 0 1 1.75 1.75v10.5a1.75 1.75 0 0 1 -1.75 1.75h-1.5a1.75 1.75 0 0 1 -1.75 -1.75v-10.5a1.75 1.75 0 0 1 1.75 -1.75z",
];
/** Leaving full screen: an X, as on the player's own full screen. */
const CLOSE =
    '<svg viewBox="0 0 18 18" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>';

function svg(paths: string[], size: number, nudge = false): string {
    const style = nudge ? ' style="transform:translateX(8%)"' : "";
    return (
        `<svg viewBox="0 0 18 18" width="${size}" height="${size}" aria-hidden="true"${style}>` +
        paths.map((d) => `<path d="${d}"/>`).join("") +
        "</svg>"
    );
}

function skipSvg(forward: boolean): string {
    const arc = forward ? "M20.5 12a8.5 8.5 0 1 1-2.9-6.4" : "M3.5 12a8.5 8.5 0 1 0 2.9-6.4";
    const head = forward ? "M20.8 4.2v4.4h-4.4" : "M3.2 4.2v4.4h4.4";
    return (
        '<svg class="skip" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" fill="none" stroke="currentColor"' +
        ` stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${arc}"/><path d="${head}"/>` +
        '<text x="12" y="15.2" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700" font-size="7.5">10</text></svg>'
    );
}

/** `m:ss`, with hours once the video reaches an hour, and two-digit minutes from ten. */
function clock(seconds: number | undefined, guide: number): string {
    const whole = Math.max(Math.floor(seconds || 0), 0);
    const h = Math.floor(whole / 3600);
    const m = Math.floor((whole % 3600) / 60);
    const sec = `0${whole % 60}`.slice(-2);
    if (h > 0 || guide >= 3600) return `${h}:${`0${m}`.slice(-2)}:${sec}`;
    const minutes = Math.floor(whole / 60);
    return `${guide >= 600 ? `0${minutes}`.slice(-2) : minutes}:${sec}`;
}

function send(message: Record<string, unknown>): void {
    // Whoever frames this page. The state is not secret: it is what a viewer of the video sees.
    window.parent.postMessage({ ...message, src: "lmc-yt" }, "*");
}

function plain(holder: HTMLElement): void {
    const frame = document.createElement("iframe");
    frame.src = `${host}/embed/${id}?autoplay=1&playsinline=1&rel=0`;
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.title = "YouTube";
    holder.replaceWith(frame);
}

function driven(): void {
    let player: YouTubePlayer | null = null;
    let ready = false;
    let timer = 0;

    // The controls drawn over the video while the app has it full-screen: this page is what fills the
    // screen, so they have to live here. Hidden otherwise; the app's own controls sit beside the picture.
    const ui = byId<HTMLDivElement>("ui");
    const ppButton = byId<HTMLButtonElement>("pp");
    const seek = byId<HTMLInputElement>("seek");
    let last: Snapshot = {};
    let fullscreen = false;
    let dragging = false;
    let hideTimer = 0;
    byId("exit").innerHTML = CLOSE;
    byId("back").innerHTML = skipSvg(false);
    byId("fwd").innerHTML = skipSvg(true);

    const moving = (status?: number) => status === PLAYING || status === BUFFERING;

    function show(on: boolean): void {
        ui.classList.toggle("idle", !on);
        clearTimeout(hideTimer);
        if (on && last.status === PLAYING) hideTimer = window.setTimeout(() => show(false), 3000);
    }

    function render(): void {
        if (!fullscreen) return;
        const playing = moving(last.status);
        ppButton.innerHTML = playing ? svg(PAUSE, 38) : svg(PLAY, 38, true);
        ppButton.setAttribute("aria-label", playing ? "Pause" : "Play");
        const total = Math.max(last.duration || 0, last.currentTime || 0);
        const now = Math.floor(last.currentTime || 0);
        byId("el").textContent = clock(last.currentTime, total);
        byId("rem").textContent = `-${clock(Math.max(Math.floor(total) - now, 0), total)}`;
        if (!dragging && total > 0) {
            seek.value = String(Math.round(((last.currentTime || 0) / total) * 1000));
            seek.style.setProperty("--p", `${Number(seek.value) / 10}%`);
        }
    }

    function setFullscreen(on: boolean): void {
        fullscreen = on;
        ui.hidden = !on;
        if (on) {
            render();
            show(true);
        }
    }

    function snapshot(): Snapshot {
        if (!ready || !player) return {};
        return {
            status: player.getPlayerState(),
            currentTime: player.getCurrentTime() || 0,
            duration: player.getDuration() || 0,
            loaded: player.getVideoLoadedFraction() || 0,
            rate: player.getPlaybackRate() || 1,
            muted: player.isMuted(),
        };
    }

    function report(type: string): void {
        const message = { ...snapshot(), type };
        last = message;
        render();
        send(message);
    }

    // A seek made while paused raises no event of its own, so the time is read for a moment after it
    // until it has moved, and the page's bar and time follow the video.
    function settle(target: number): void {
        let tries = 0;
        const wait = window.setInterval(() => {
            report("time");
            const now = player?.getCurrentTime() || 0;
            if (++tries > 20 || Math.abs(now - target) < 1.5) clearInterval(wait);
        }, 100);
    }

    // Playing and buffering move on their own, so the time is read until something stops them.
    function follow(status: number): void {
        clearInterval(timer);
        if (moving(status)) timer = window.setInterval(() => report("time"), 250);
    }

    function skipBy(seconds: number): void {
        if (!ready || !player) return;
        const total = player.getDuration() || 0;
        const target = Math.min(Math.max((player.getCurrentTime() || 0) + seconds, 0), total || 0);
        player.seekTo(target, true);
        settle(target);
        show(true);
    }

    ppButton.addEventListener("click", () => {
        if (!ready || !player) return;
        if (moving(last.status)) player.pauseVideo();
        else player.playVideo();
        show(true);
    });
    byId("back").addEventListener("click", () => skipBy(-10));
    byId("fwd").addEventListener("click", () => skipBy(10));
    seek.addEventListener("input", () => {
        dragging = true;
        const total = player?.getDuration() || 0;
        byId("el").textContent = clock((Number(seek.value) / 1000) * total, total);
        seek.style.setProperty("--p", `${Number(seek.value) / 10}%`);
        show(true);
    });
    seek.addEventListener("change", () => {
        const total = player?.getDuration() || 0;
        const target = (Number(seek.value) / 1000) * total;
        dragging = false;
        player?.seekTo(target, true);
        settle(target);
        show(true);
    });
    byId("exit").addEventListener("click", () => send({ type: "exit" }));
    // A tap on the picture shows or hides the controls.
    ui.addEventListener("click", (event) => {
        if (event.target === ui) show(ui.classList.contains("idle"));
    });

    window.onYouTubeIframeAPIReady = () => {
        if (!window.YT) return;
        player = new window.YT.Player("p", {
            host,
            videoId: id,
            width: "100%",
            height: "100%",
            playerVars: {
                autoplay: 1,
                controls: 0,
                playsinline: 1,
                rel: 0,
                fs: 0,
                disablekb: 1,
                iv_load_policy: 3,
                origin: location.origin,
            },
            events: {
                onReady: () => {
                    ready = true;
                    report("ready");
                    // `&demo=1` shows the full-screen controls without the app, to look at them in a browser.
                    if (query.get("demo") === "1") setFullscreen(true);
                },
                onStateChange: (event: { data: number }) => {
                    follow(event.data);
                    report("state");
                },
                onPlaybackRateChange: () => report("state"),
                onError: (event: { data: number }) => send({ type: "error", code: event.data }),
            },
        });
    };

    window.addEventListener("message", (event: MessageEvent) => {
        const message = event.data as {
            src?: string;
            cmd?: string;
            value?: unknown;
            inset?: unknown;
        } | null;
        if (event.source !== window.parent || !message || message.src !== "lmc-yt") return;
        if (!ready || !player) return;
        switch (message.cmd) {
            case "play":
                player.playVideo();
                break;
            case "pause":
                player.pauseVideo();
                break;
            case "seek": {
                const target = Number(message.value) || 0;
                player.seekTo(target, true);
                settle(target);
                break;
            }
            case "rate":
                player.setPlaybackRate(Number(message.value) || 1);
                break;
            case "mute":
                player.mute();
                report("state");
                break;
            case "unmute":
                player.unMute();
                report("state");
                break;
            case "snapshot":
                report("state");
                break;
            case "fullscreen":
                if (typeof message.inset === "number" && message.inset > 0) {
                    document.documentElement.style.setProperty("--notch", `${message.inset}px`);
                }
                setFullscreen(!!message.value);
                break;
        }
    });

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => send({ type: "error", code: "script" });
    document.head.appendChild(script);
}

if (/^[A-Za-z0-9_-]{11}$/.test(id)) {
    if (query.get("api") === "1") driven();
    else plain(byId("p"));
}

export {};
