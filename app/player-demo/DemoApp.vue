<script setup lang="ts">
import { AUDIO_ONLY_ANGLE_ID } from '@luminary-media-converter/player-core';
/**
 * Dev-only harness for the player (Video.js).
 *
 * Paste any master playlist URL — plain or LMCENC-encrypted, byte-range or not
 * — plus an optional 32-hex-char session key, and it plays through the real
 * `LuminaryPlayer` → `PlayerController` → `HlsJsVideoAdapter` path, in the Luminary
 * app's chrome. A YouTube URL in the same field switches the component into
 * YouTube mode, where the LMC pipeline is bypassed entirely.
 *
 * There is no host transport here: this player draws a full control bar over
 * the picture — unless "Bare when windowed" is ticked, which is how the encoder
 * embeds it, and then fullscreen (double-click) is where the controls are. The
 * selectors below drive `setAngle` / `setQuality` / `setAudioTrack` through
 * the video.js path.
 *
 * Not shipped anywhere: served only by `npm -w player-web run demo`.
 */
import { computed, onMounted, reactive, ref, shallowRef, watchEffect } from 'vue';
import type { PlayerSource } from '@luminary-media-converter/player-core';
import { isYouTubeUrl } from '../src/youtube';
import LuminaryPlayer from '../src/components/LuminaryPlayer.vue';
import type { PlayerImage } from '../src/image';

const STORAGE_KEY = 'luminary-legacy-player-demo';

const saved = (() => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
            url?: string;
            keyHex?: string;
            poster?: string;
            posterFallback?: string;
            preferredLanguage?: string;
            prefetchDebug?: boolean;
            bare?: boolean;
            thumbs?: boolean;
            chapters?: boolean;
        };
    } catch {
        return {};
    }
})();

const form = reactive({
    url: saved.url ?? '',
    keyHex: saved.keyHex ?? '',
    poster: saved.poster ?? '',
    posterFallback: saved.posterFallback ?? '',
    preferredLanguage: saved.preferredLanguage ?? '',
    // Default ON here: watching the warming work is half of what this
    // harness is for. The library default is off.
    prefetchDebug: saved.prefetchDebug ?? true,
    // How the encoder embeds the player: nothing on the frame until fullscreen.
    bare: saved.bare ?? false,
    // Whether to hand the player a `thumbnails.vtt` beside the master, as a host that knows one exists would.
    thumbs: saved.thumbs ?? false,
    // Whether to hand the player a `chapters/en.vtt` beside the master: the timeline is cut at its chapters.
    chapters: saved.chapters ?? false,
});

const source = shallowRef<PlayerSource | null>(null);

// `?afs=light|dark` opens in audio mode with something to say about it, for the fullscreen audio screen; `?cover=URL` is its picture.
const afs = new URLSearchParams(location.search).get('afs');
const nowPlaying = afs
    ? { title: 'Why we get thirsty', subtitle: 'Pastor Daniel', eyebrow: 'Sunday messages' }
    : undefined;
const appearance = afs === 'light' ? 'light' : 'dark';

// `?master=…&key=…` fills the form and loads on open, so a link can point straight at a source.
// Not `?url`: Vite reserves that query for asset imports and refuses the page request outright.
const query = new URLSearchParams(location.search);
if (query.has('master')) form.url = query.get('master') ?? '';
if (query.has('key')) form.keyHex = query.get('key') ?? '';
if (query.has('thumbs')) form.thumbs = query.get('thumbs') !== '0';
if (query.has('chapters')) form.chapters = query.get('chapters') !== '0';
// `?nextup=N` offers N videos near the end of full-screen, for looking at the strip.
const nextUp = Array.from({ length: Number(query.get('nextup') ?? 0) || 0 }, (_, i) => ({
    id: `next-${i}`,
    title: `Up next ${i + 1}: a title long enough to need a second line`,
    section: i === 0 ? 'Next in this series' : 'Related',
}));
// `?embed` drops the form and the notes, for a side-by-side page that only wants the player.
const embed = query.has('embed');
onMounted(() => {
    if (query.has('master')) load();
});
const poster = shallowRef<PlayerImage | undefined>(undefined);
const preferredLanguage = ref('');
const player = ref<InstanceType<typeof LuminaryPlayer> | null>(null);
const formError = ref('');

const controllerOptions = shallowRef<{ prefetch: { debug: boolean } }>({
    prefetch: { debug: form.prefetchDebug },
});
const controls = shallowRef({ windowedControls: !form.bare });
const playerKey = ref(0);

/**
 * One field holds either a single URL or a srcset, told apart by the width (or
 * density) descriptors a srcset carries; the fallback rides alongside.
 */
function toImage(value: string, fallback: string): PlayerImage | undefined {
    const text = value.trim();
    const last = fallback.trim();
    if (!text && !last) return undefined;
    const isSrcset = /\s\d+(\.\d+)?[wx]\s*(,|$)/.test(text);
    return {
        ...(text ? (isSrcset ? { srcset: text } : { src: text }) : {}),
        ...(last ? { fallback: last } : {}),
    };
}

function load() {
    const url = form.url.trim();
    const keyHex = form.keyHex.trim().toLowerCase();
    if (!url) {
        formError.value = 'A master playlist URL is required.';
        return;
    }
    if (keyHex && !/^[0-9a-f]{32}$/.test(keyHex)) {
        formError.value = 'The key must be 32 hex characters (16-byte AES-128 key).';
        return;
    }
    formError.value = '';
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            url,
            keyHex,
            poster: form.poster.trim(),
            posterFallback: form.posterFallback.trim(),
            preferredLanguage: form.preferredLanguage.trim(),
            prefetchDebug: form.prefetchDebug,
            bare: form.bare,
            thumbs: form.thumbs,
            chapters: form.chapters,
        }),
    );
    // Controller options and `controls` are read once at construction, so a
    // change to either is what needs a remount — and only then. Every other Load
    // leaves the component mounted and lets the `source` watch reload in place,
    // which is the path a host actually takes and therefore the one worth
    // exercising here (mode switches, angle rebuilds, the load-generation
    // guard); remounting unconditionally would hide all of it behind a fresh
    // player every time.
    const windowedControls = !form.bare;
    if (
        form.prefetchDebug !== controllerOptions.value.prefetch.debug ||
        windowedControls !== controls.value.windowedControls
    ) {
        controllerOptions.value = { prefetch: { debug: form.prefetchDebug } };
        controls.value = { windowedControls };
        playerKey.value++;
    }
    poster.value = toImage(form.poster || new URLSearchParams(location.search).get('cover') || '', form.posterFallback);
    preferredLanguage.value = form.preferredLanguage.trim();
    source.value = {
        masterUrl: url,
        ...(afs ? { startAngleId: AUDIO_ONLY_ANGLE_ID } : {}),
        ...(keyHex ? { keyHex } : {}),
        ...(form.thumbs || form.chapters
            ? {
                  sidecars: {
                      ...(form.thumbs ? { thumbnails: { url: new URL('thumbnails.vtt', url).href } } : {}),
                      ...(form.chapters ? { chapters: [{ lang: 'en', url: new URL('chapters/en.vtt', url).href }] } : {}),
                  },
              }
            : {}),
    };
}

const state = computed(() => player.value?.state ?? null);
const youtubeMode = computed(() => isYouTubeUrl(source.value?.masterUrl ?? ''));

// Selector models kept in sync with the player's own idea of what is active.
const angleModel = ref('');
const qualityModel = ref('auto');
const audioModel = ref('');

watchEffect(() => {
    angleModel.value = state.value?.activeAngleId ?? '';
    qualityModel.value = state.value?.activeQualityId ?? 'auto';
    audioModel.value = state.value?.activeAudioTrackId ?? '';
});

function onAngle() {
    void player.value?.controller?.setAngle(angleModel.value);
}
function onQuality() {
    player.value?.controller?.setQuality(qualityModel.value);
}
function onAudio() {
    player.value?.controller?.setAudioTrack(audioModel.value);
}

const fmt = (n: number | undefined) => (n ?? 0).toFixed(1);
</script>

<template>
    <main class="demo">
        <h1 v-if="!embed">Luminary player (Video.js) — test harness</h1>

        <form v-if="!embed" class="demo-form" @submit.prevent="load">
            <label>
                Master playlist URL — or a YouTube link, which switches the
                player into YouTube mode
                <input
                    v-model="form.url"
                    type="text"
                    placeholder="http://localhost:9000/bucket/prefix/master.m3u8"
                    spellcheck="false"
                />
            </label>
            <label>
                Session key (optional, 32 hex chars)
                <input
                    v-model="form.keyHex"
                    type="text"
                    placeholder="unmasked AES-128 key for encrypted output"
                    spellcheck="false"
                />
            </label>
            <label>
                Poster (optional) — a URL, or a srcset: "a-640.jpg 640w, a-1280.jpg 1280w".
                Also what audio-only shows, under the glyph
                <input
                    v-model="form.poster"
                    type="text"
                    placeholder="https://example.com/artwork.jpg"
                    spellcheck="false"
                />
            </label>
            <label>
                Poster fallback (optional) — shown if the poster cannot load
                <input
                    v-model="form.posterFallback"
                    type="text"
                    placeholder="https://example.com/fallback.jpg"
                    spellcheck="false"
                />
            </label>
            <label>
                Preferred audio language (optional) — "en", "eng" or "en-US"
                <input
                    v-model="form.preferredLanguage"
                    type="text"
                    placeholder="en"
                    spellcheck="false"
                />
            </label>
            <label class="demo-check">
                <input v-model="form.prefetchDebug" type="checkbox" />
                Log chunk warming to the console (applies on Load)
            </label>
            <label class="demo-check">
                <input v-model="form.bare" type="checkbox" />
                Bare when windowed — no controls outside fullscreen; double-click
                for fullscreen, as the encoder embeds it (applies on Load)
            </label>
            <label class="demo-check">
                <input v-model="form.thumbs" type="checkbox" />
                Scrub thumbnails — a <code>thumbnails.vtt</code> beside the master (applies on Load)
            </label>
            <label class="demo-check">
                <input v-model="form.chapters" type="checkbox" />
                Chapters — a <code>chapters/en.vtt</code> beside the master: the timeline is cut at them (applies on Load)
            </label>
            <button type="submit">Load</button>
            <p v-if="formError" class="demo-error">{{ formError }}</p>
        </form>

        <template v-if="source">
            <LuminaryPlayer
                ref="player"
                :key="playerKey"
                :source="source"
                :poster="poster"
                :controls="controls"
                :preferred-language="preferredLanguage || undefined"
                :controller-options="controllerOptions"
                :now-playing="nowPlaying"
                :appearance="appearance"
                :next-up="nextUp.length ? nextUp : undefined"
            />

            <p v-if="youtubeMode" class="demo-hint">
                YouTube mode: the LMC pipeline is bypassed, so the exposed
                controller is <code>null</code> and the state readout below stays
                at its initial values. The chrome is fully functional.
            </p>

            <div v-if="state && !youtubeMode" class="demo-controls">
                <label v-if="(state.angles?.length ?? 0) > 1">
                    Angle
                    <select v-model="angleModel" @change="onAngle">
                        <option v-for="a in state.angles" :key="a.id" :value="a.id">
                            {{ a.name }}
                        </option>
                    </select>
                </label>
                <label v-if="(state.qualities?.length ?? 0) > 1">
                    Quality
                    <select v-model="qualityModel" @change="onQuality">
                        <option value="auto">auto</option>
                        <option v-for="q in state.qualities" :key="q.id" :value="q.id">
                            {{ q.label }}
                        </option>
                    </select>
                </label>
                <label v-if="(state.audioTracks?.length ?? 0) > 1">
                    Audio
                    <select v-model="audioModel" @change="onAudio">
                        <option v-for="t in state.audioTracks" :key="t.id" :value="t.id">
                            {{ t.label || t.id }}
                        </option>
                    </select>
                </label>
                <button type="button" @click="player?.enterFullscreen()">Fullscreen</button>
            </div>

            <dl v-if="state" class="demo-state">
                <div>
                    <dt>lifecycle</dt>
                    <dd>{{ state.lifecycle }}</dd>
                </div>
                <div>
                    <dt>time</dt>
                    <dd>{{ fmt(state.currentTime) }} / {{ fmt(state.duration) }} s</dd>
                </div>
                <div>
                    <dt>buffered to</dt>
                    <dd>{{ fmt(state.bufferedEnd) }} s</dd>
                </div>
                <div>
                    <dt>audio only</dt>
                    <dd>{{ state.isAudioOnly }}</dd>
                </div>
                <div v-if="state.error">
                    <dt>error</dt>
                    <dd>{{ state.error.code }}: {{ state.error.message }}</dd>
                </div>
            </dl>

            <p v-if="!embed" class="demo-hint">
                Encrypted output should produce <em>no</em> request carrying the
                key and no <code>luminary://</code> request at all — the key is
                served to VHS from memory. Chunk warming shows up as a single
                <code>Range: bytes=0-65535</code> request per
                <code>media/…</code> chunk, fired as the buffer front nears the
                previous chunk's end.
            </p>
        </template>
    </main>
</template>

<style>
body {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #111;
    color: #eee;
}
.demo {
    max-width: 960px;
    margin: 0 auto;
    padding: 1.5rem;
}
.demo h1 {
    font-size: 1.1rem;
    font-weight: 600;
}
.demo-form {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
}
.demo-form label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #aaa;
}
.demo-form input {
    padding: 0.5rem 0.65rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #1c1c1c;
    color: #eee;
    font: inherit;
}
.demo-form button,
.demo-controls button {
    justify-self: start;
    padding: 0.45rem 1.1rem;
    border: 1px solid #444;
    border-radius: 6px;
    background: #2563eb;
    color: #fff;
    font: inherit;
    cursor: pointer;
}
.demo-error {
    color: #f87171;
    font-size: 0.85rem;
    margin: 0;
}
.demo-check {
    display: flex !important;
    grid-auto-flow: column;
    align-items: center;
    gap: 0.5rem !important;
    flex-direction: row;
}
.demo-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: end;
    margin-top: 1rem;
}
.demo-controls label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #aaa;
}
.demo-controls select {
    padding: 0.4rem 0.5rem;
    border: 1px solid #333;
    border-radius: 6px;
    background: #1c1c1c;
    color: #eee;
    font: inherit;
}
.demo-controls button {
    background: #333;
}
.demo-state {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    margin-top: 1rem;
    font-size: 0.85rem;
}
.demo-state div {
    display: grid;
    gap: 0.15rem;
}
.demo-state dt {
    color: #888;
}
.demo-state dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
}
.demo-hint {
    margin-top: 1.25rem;
    font-size: 0.8rem;
    color: #777;
}
.demo-hint code {
    color: #aaa;
}
</style>
