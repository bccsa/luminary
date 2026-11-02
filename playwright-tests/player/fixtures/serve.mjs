// Static server for the fixtures: CORS, Range, and a request log the tests read back.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'out');
/**
 * The native player's sample stream, read where it lives rather than copied (54 MB): two angles, four languages,
 * AES-128 under `luminary://key`, byte-range chunk chains. Served at `/native/`; its key is
 * 6c756d696e6172792d737069a4e2c0de.
 */
const NATIVE = join(HERE, '../../../player-native/spike/android/app/src/main/assets/stream');
const PORT = Number(process.env.FIXTURE_PORT ?? 5190);
const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4' };
/** Every request seen, so a test can assert on what the player asked for. */
const log = [];
/** Armed faults: a request whose path contains `match` waits `ms`, and answers `status` when one is set, `times` times. */
const faults = [];
/** When the simulated live stream started, so the window can advance with the wall clock. */
let liveStart = Date.now();
const LIVE_SEGMENT_SECONDS = 2;
const LIVE_INITIAL_SEGMENTS = 3;

/**
 * A live view of the clear fixture: media playlists grow by one segment every two seconds and never
 * carry #EXT-X-ENDLIST, which is what makes the player treat the stream as live. Segments, inits and
 * the master come from the clear output.
 */
function liveResponse(pathname) {
    const name = pathname.replace(/^\/live\//, '');
    const clear = join(ROOT, 'clear', name);
    if (!existsSync(clear)) return null;
    if (!/^v[^/]*\.m3u8$/.test(name)) return { file: clear };
    const lines = readFileSync(clear, 'utf8').split('\n');
    const head = lines.filter((l) => l && !l.startsWith('#EXTINF') && !/\.m4s$/.test(l) && !l.startsWith('#EXT-X-ENDLIST') && !l.startsWith('#EXT-X-PLAYLIST-TYPE'));
    const segs = [];
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXTINF')) segs.push(`${lines[i]}\n${lines[i + 1]}`);
    const elapsed = (Date.now() - liveStart) / 1000;
    const shown = Math.min(segs.length, LIVE_INITIAL_SEGMENTS + Math.floor(elapsed / LIVE_SEGMENT_SECONDS));
    return { text: `${head.join('\n')}\n${segs.slice(0, shown).join('\n')}\n` };
}

createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (url.pathname === '/__log') {
        res.setHeader('Content-Type', 'application/json');
        if (url.searchParams.has('clear')) log.length = 0;
        return void res.end(JSON.stringify(log));
    }
    if (url.pathname === '/__fault') {
        if (url.searchParams.has('clear')) faults.length = 0;
        else faults.push({ match: url.searchParams.get('match') ?? '', ms: Number(url.searchParams.get('ms') ?? 0), status: Number(url.searchParams.get('status') ?? 0), times: Number(url.searchParams.get('times') ?? 1) });
        return void res.writeHead(204).end();
    }
    if (url.pathname === '/__live-reset') {
        liveStart = Date.now();
        return void res.writeHead(204).end();
    }
    if (url.pathname.startsWith('/live/')) {
        const live = liveResponse(url.pathname);
        if (!live) return void res.writeHead(404).end();
        log.push({ path: url.pathname, range: req.headers.range ?? null, at: Date.now() });
        if (live.text !== undefined) {
            res.setHeader('Content-Type', TYPES['.m3u8']);
            res.setHeader('Cache-Control', 'no-store');
            return void res.end(live.text);
        }
        return serveFile(req, res, live.file);
    }
    const native = url.pathname.startsWith('/native/');
    const base = native ? NATIVE : ROOT;
    const file = normalize(join(base, native ? url.pathname.slice('/native'.length) : url.pathname));
    if (!file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
        return void res.writeHead(404).end();
    }
    log.push({ path: url.pathname, range: req.headers.range ?? null, at: Date.now() });
    const fault = faults.find((f) => f.times > 0 && url.pathname.includes(f.match));
    if (fault) fault.times--;
    setTimeout(() => (fault?.status ? void res.writeHead(fault.status).end() : serveFile(req, res, file)), fault?.ms ?? 0);
}).listen(PORT, '127.0.0.1', () => console.log(`fixtures on http://127.0.0.1:${PORT}`));

function serveFile(req, res, file) {
    if (res.destroyed || req.socket.destroyed) return;
    const size = statSync(file).size;
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
    if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        return void createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Length': size });
    createReadStream(file).pipe(res);
}
