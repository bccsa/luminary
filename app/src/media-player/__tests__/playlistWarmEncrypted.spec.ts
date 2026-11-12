import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
// The player's own controller and fixtures, so the warm copies go through the real fetch-and-decrypt path.
import { PlayerController } from "../../../../luminary-media-convert/player-core/src/controller";
import {
    ENCRYPTED_MEDIA_PLAYLIST,
    FakeAdapter,
    FakeServeStrategy,
    PLAIN_MEDIA_PLAYLIST,
    SIMPLE_MASTER,
    TEST_KEY_HEX,
    encryptLmcenc,
} from "../../../../luminary-media-convert/player-core/src/test-support/index";
import { warmFetch, warmPlaylists } from "../playlistWarm";

const BASE = "https://cdn.example.com/out/session";
const MASTER_URL = `${BASE}/master.m3u8`;

function serve(bodies: Record<string, string | Uint8Array>) {
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
            const body = bodies[String(input)];
            return body === undefined
                ? new Response("", { status: 404 })
                : new Response(typeof body === "string" ? body : body.slice(0));
        }),
    );
}

async function playWarmed(bodies: Record<string, string | Uint8Array>) {
    serve(bodies);
    // The playlists are warmed while the key is still on its way, then the load goes with the key.
    warmPlaylists(MASTER_URL);
    await flushPromises();
    const adapter = new FakeAdapter();
    const controller = new PlayerController(adapter, {
        fetchImpl: warmFetch,
        serveStrategy: new FakeServeStrategy(),
        prefetch: { enabled: false },
    });
    await controller.load({ masterUrl: MASTER_URL, keyHex: TEST_KEY_HEX });
    return controller.getState();
}

const sealed = (text: string) => encryptLmcenc(text, TEST_KEY_HEX);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("a protected video through the warmed playlists", () => {
    it("decrypts encrypted media playlists warmed before the key arrived", async () => {
        const state = await playWarmed({
            [MASTER_URL]: SIMPLE_MASTER,
            [`${BASE}/stream_1080/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/stream_720/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/stream_480/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/audio_hi_128kbps/playlist.m3u8`]: sealed(PLAIN_MEDIA_PLAYLIST),
            [`${BASE}/audio_lo_64kbps/playlist.m3u8`]: sealed(PLAIN_MEDIA_PLAYLIST),
        });
        expect(state.error).toBeNull();
        expect(state.lifecycle).toBe("ready");
    });

    it("decrypts an encrypted master warmed before the key arrived", async () => {
        const state = await playWarmed({
            [MASTER_URL]: sealed(SIMPLE_MASTER),
            [`${BASE}/stream_1080/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/stream_720/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/stream_480/playlist.m3u8`]: sealed(ENCRYPTED_MEDIA_PLAYLIST),
            [`${BASE}/audio_hi_128kbps/playlist.m3u8`]: sealed(PLAIN_MEDIA_PLAYLIST),
            [`${BASE}/audio_lo_64kbps/playlist.m3u8`]: sealed(PLAIN_MEDIA_PLAYLIST),
        });
        expect(state.error).toBeNull();
        expect(state.lifecycle).toBe("ready");
    });
});
