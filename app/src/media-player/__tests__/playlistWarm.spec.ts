import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { playlistsOf, warmFetch, warmPlaylists } from "../playlistWarm";

const BASE = "https://cdn.example.com/v1/";
const MASTER = [
    "#EXTM3U",
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="en",URI="audio_en/playlist.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,AUDIO="a"',
    "v360/playlist.m3u8",
].join("\n");

function network(bodies: Record<string, string>) {
    const calls: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            return bodies[url] !== undefined
                ? new Response(bodies[url])
                : new Response("", { status: 404 });
        }),
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("playlists warmed beside the key", () => {
    it("fetches the master and what it lists, then answers the player from memory once", async () => {
        const calls = network({
            [`${BASE}master.m3u8`]: MASTER,
            [`${BASE}v360/playlist.m3u8`]: "#EXTM3U\nv",
            [`${BASE}audio_en/playlist.m3u8`]: "#EXTM3U\na",
        });
        warmPlaylists(`${BASE}master.m3u8`);
        await flushPromises();
        expect(calls).toHaveLength(3);

        expect(await (await warmFetch(`${BASE}v360/playlist.m3u8`)).text()).toBe("#EXTM3U\nv");
        expect(calls).toHaveLength(3);
        // Taken once: the next ask goes to the network.
        await warmFetch(`${BASE}v360/playlist.m3u8`);
        expect(calls).toHaveLength(4);
    });

    it("hands the player the very bytes that arrived, so an encrypted playlist still decrypts", async () => {
        // An LMCENC body: binary, not text, and no `#EXTM3U` to read.
        const bytes = new Uint8Array([0x4c, 0x4d, 0x43, 0x00, 0xff, 0xfe, 0x80, 0xc3, 0x28, 0x01]);
        const calls: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) => {
                calls.push(String(input));
                return new Response(bytes.slice(0));
            }),
        );
        warmPlaylists(`${BASE}sealed.m3u8`);
        await flushPromises();
        const answer = new Uint8Array(await (await warmFetch(`${BASE}sealed.m3u8`)).arrayBuffer());
        expect([...answer]).toEqual([...bytes]);
        // Nothing to read in it, so nothing else was fetched.
        expect(calls).toHaveLength(1);
    });

    it("leaves a failure to the player's own fetch", async () => {
        const calls = network({});
        warmPlaylists(`${BASE}gone.m3u8`);
        await flushPromises();
        const response = await warmFetch(`${BASE}gone.m3u8`);
        expect(response.status).toBe(404);
        expect(calls).toHaveLength(2);
    });

    it("warms no camera's playlists when the master has more than one", () => {
        const twoCameras = [
            "#EXTM3U",
            '#EXT-X-STREAM-INF:BANDWIDTH=1,VIDEO="wide"',
            "w.m3u8",
            '#EXT-X-STREAM-INF:BANDWIDTH=1,VIDEO="close"',
            "c.m3u8",
        ].join("\n");
        expect(playlistsOf(twoCameras, `${BASE}master.m3u8`)).toEqual([]);
        expect(playlistsOf(MASTER, `${BASE}master.m3u8`)).toEqual([
            `${BASE}audio_en/playlist.m3u8`,
            `${BASE}v360/playlist.m3u8`,
        ]);
    });
});
