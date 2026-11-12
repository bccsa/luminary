// Builds the deterministic HLS fixtures the browser tests play. Output goes to
// ./out (gitignored) so nothing generated is committed.
import { execFileSync } from 'node:child_process';
import { createCipheriv, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');

/** Fixed key so tests can hand it to the player without fetching it. */
export const KEY_HEX = '00112233445566778899aabbccddeeff';
const KEY = Buffer.from(KEY_HEX, 'hex');
const KEY_URI = 'luminary://key';
const DURATION = 12;
const SEGMENT = 2;

const run = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

/** Encodes one clear fMP4 HLS ladder (two video renditions, one audio group). */
function encodeLadder(dir, { singleFile = false, audios = [{ freq: 440, lang: 'eng', name: 'English' }] } = {}) {
    mkdirSync(dir, { recursive: true });
    const args = [
        '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=25:duration=${DURATION}`,
        ...audios.flatMap((a) => ['-f', 'lavfi', '-i', `sine=frequency=${a.freq}:sample_rate=48000:duration=${DURATION}`]),
        '-filter_complex',
        '[0:v]split=2[a][b];[a]scale=640:360,setsar=1[v0];[b]scale=320:180,setsar=1[v1]',
        '-map', '[v0]', '-map', '[v1]', ...audios.flatMap((_, i) => ['-map', `${i + 1}:a`]),
        '-c:v', 'libx264', '-preset', 'veryfast', '-g', '50', '-keyint_min', '50', '-sc_threshold', '0',
        '-b:v:0', '800k', '-b:v:1', '250k',
        '-c:a', 'aac', '-b:a', '64k',
        '-f', 'hls', '-hls_time', String(SEGMENT), '-hls_playlist_type', 'vod',
        '-hls_segment_type', 'fmp4', '-hls_flags', singleFile ? 'independent_segments+single_file' : 'independent_segments',
        ...(singleFile ? [] : ['-hls_segment_filename', join(dir, 'v%v_%03d.m4s')]),
        '-master_pl_name', 'master.m3u8',
        '-var_stream_map', [
            'v:0,agroup:aud', 'v:1,agroup:aud',
            ...audios.map((a, i) => `a:${i},agroup:aud,language:${a.lang},name:${i === 0 ? 'audio' : `audio${i}`}${i === 0 ? ',default:yes' : ''}`),
        ].join(' '),
        join(dir, 'v%v.m3u8'),
    ];
    run(args);
}

/** AES-128-CBC with a fresh IV per file, framed the way docs/encrypted-sidecar-format.md describes. */
function lmcenc(plain) {
    const iv = createHash('sha256').update(plain).digest().subarray(0, 16);
    const cipher = createCipheriv('aes-128-cbc', KEY, iv);
    return Buffer.concat([Buffer.from('LMCENC01'), iv, cipher.update(plain), cipher.final()]);
}

function buildClear() {
    encodeLadder(join(OUT, 'clear'));
}

const IV_HEX = 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf';

/**
 * ffmpeg refuses to encrypt fMP4, so segments are encrypted afterwards the way the encoder does:
 * AES-128-CBC over each whole .m4s, the init left clear, and an EXT-X-KEY ahead of the first segment.
 */
function buildEncrypted() {
    const dir = join(OUT, 'encrypted');
    encodeLadder(dir);
    const iv = Buffer.from(IV_HEX, 'hex');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.m4s'))) {
        const p = join(dir, f);
        const cipher = createCipheriv('aes-128-cbc', KEY, iv);
        writeFileSync(p, Buffer.concat([cipher.update(readFileSync(p)), cipher.final()]));
    }
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.m3u8'))) {
        const p = join(dir, f);
        let text = readFileSync(p, 'utf8');
        if (!f.startsWith('master')) {
            text = text.replace(/(#EXT-X-MAP:[^\n]*\n)/, `$1#EXT-X-KEY:METHOD=AES-128,URI="${KEY_URI}",IV=0x${IV_HEX}\n`);
        }
        writeFileSync(p, lmcenc(Buffer.from(text)));
    }
}

/**
 * Byte-range output the way the encoder packs it: every video rendition shares ONE chunk object
 * (renditions interleaved by offset) and the audio has its own, so a cold chunk is cold for all of
 * them. ffmpeg's single_file output gives one object per rendition; they are concatenated here and
 * each playlist's #EXT-X-BYTERANGE offsets shifted by where its bytes landed.
 */
function buildByteRange() {
    const dir = join(OUT, 'byterange');
    encodeLadder(dir, { singleFile: true });
    mkdirSync(join(dir, 'media'), { recursive: true });
    const chains = { video: { name: 'video_0.m4s', parts: [], size: 0 }, audio: { name: 'audio_0.m4s', parts: [], size: 0 } };
    for (const f of readdirSync(dir).filter((n) => /^v(\d+|audio)\.m3u8$/.test(n))) {
        const chain = f.startsWith('vaudio') ? chains.audio : chains.video;
        const playlist = readFileSync(join(dir, f), 'utf8');
        const media = /^#EXT-X-BYTERANGE:.*\n(.+)$/m.exec(playlist)?.[1] ?? /^(?!#)(.+\.m4s)$/m.exec(playlist)?.[1];
        const bytes = readFileSync(join(dir, media));
        const base = chain.size;
        chain.parts.push(bytes);
        chain.size += bytes.length;
        // The init travels as its own file, as the encoder ships it; the rest stays a byte range.
        const map = /#EXT-X-MAP:URI="[^"]*",BYTERANGE="(\d+)@(\d+)"/.exec(playlist);
        const initName = `init_${f.replace('.m3u8', '')}.mp4`;
        if (map) writeFileSync(join(dir, initName), bytes.subarray(Number(map[2]), Number(map[2]) + Number(map[1])));
        const rewritten = playlist
            .replace(/#EXT-X-MAP:URI="[^"]*",BYTERANGE="\d+@\d+"/, `#EXT-X-MAP:URI="${initName}"`)
            .replace(/#EXT-X-BYTERANGE:(\d+)@(\d+)/g, (_m, len, off) => `#EXT-X-BYTERANGE:${len}@${Number(off) + base}`)
            .split('\n')
            .map((line) => (line === media ? `media/${chain.name}` : line))
            .join('\n');
        writeFileSync(join(dir, f), rewritten);
        rmSync(join(dir, media));
    }
    for (const chain of Object.values(chains)) {
        writeFileSync(join(dir, 'media', chain.name), Buffer.concat(chain.parts));
    }
}

/**
 * A scrub-preview sprite sheet and the `thumbnails.vtt` that indexes it, in the shape the encoder
 * writes: one frame a second, laid out five to a row, each cue `sheet#xywh=x,y,w,h` relative to the VTT.
 * An encrypted session wraps the VTT (LMCENC) and leaves the sprite image plain.
 */
const THUMB_W = 160;
const THUMB_H = 90;
const THUMB_COLUMNS = 5;

function vttTime(seconds) {
    const ms = Math.round(seconds * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

function addThumbnails(dir, { encrypt = false } = {}) {
    mkdirSync(dir, { recursive: true });
    const rows = Math.ceil(DURATION / THUMB_COLUMNS);
    run([
        '-f', 'lavfi', '-i', `testsrc2=size=640x360:rate=25:duration=${DURATION}`,
        '-vf', `fps=1,scale=${THUMB_W}:${THUMB_H},tile=${THUMB_COLUMNS}x${rows}`,
        '-frames:v', '1', '-q:v', '4',
        join(dir, 'thumbnails_0.jpg'),
    ]);
    const lines = ['WEBVTT', ''];
    for (let i = 0; i < DURATION; i++) {
        const x = (i % THUMB_COLUMNS) * THUMB_W;
        const y = Math.floor(i / THUMB_COLUMNS) * THUMB_H;
        // The last cue runs to the end of the media, which is a hair longer than a whole number of seconds.
        const end = i === DURATION - 1 ? DURATION + 0.5 : i + 1;
        lines.push(`${vttTime(i)} --> ${vttTime(end)}`, `thumbnails_0.jpg#xywh=${x},${y},${THUMB_W},${THUMB_H}`, '');
    }
    const text = Buffer.from(lines.join('\n'));
    writeFileSync(join(dir, 'thumbnails.vtt'), encrypt ? lmcenc(text) : text);
}

/** A `chapters/en.vtt` beside the master, as the encoder writes it: four stretches of the clip, each titled. */
function addChapters(dir) {
    const folder = join(dir, 'chapters');
    mkdirSync(folder, { recursive: true });
    const titles = ['Beginning', 'Middle', 'Later', 'End'];
    const lines = ['WEBVTT', ''];
    titles.forEach((title, i) => {
        const start = (i * DURATION) / titles.length;
        lines.push(`${vttTime(start)} --> ${vttTime(((i + 1) * DURATION) / titles.length)}`, title, '');
    });
    writeFileSync(join(folder, 'en.vtt'), lines.join('\n'));
}

/** Two audio languages in one group, so the player has a language to choose. */
function buildMultiAudio() {
    encodeLadder(join(OUT, 'multiaudio'), {
        audios: [
            { freq: 440, lang: 'eng', name: 'English' },
            { freq: 880, lang: 'afr', name: 'Afrikaans' },
        ],
    });
}

rmSync(OUT, { recursive: true, force: true });
buildClear();
buildEncrypted();
buildByteRange();
buildMultiAudio();
addThumbnails(join(OUT, 'clear'));
addChapters(join(OUT, 'clear'));
addThumbnails(join(OUT, 'encrypted'), { encrypt: true });
addThumbnails(join(OUT, 'byterange'));
addThumbnails(join(OUT, 'multiaudio'));
console.log(`fixtures written to ${OUT}`);
