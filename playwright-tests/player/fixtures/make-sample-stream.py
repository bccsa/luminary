#!/usr/bin/env python3
"""
Builds a watchable sample stream for the Android spike, laid out the way the encoder writes it,
bundles it in the app, and records the payload the TypeScript half would send for it.

- Two angles: "Wide" (the source) and "Mirror" (flipped), each a 720p / 360p / 240p ladder.
- Every audio track of the source, stereo AAC, in one audio group.
- 6 s fMP4 segments, AES-128-CBC encrypted one by one under a single explicit IV, packed into
  shared chunk chains (one per angle, one for audio) addressed with #EXT-X-BYTERANGE. The first
  chunk of a chain closes at about 20 s of content, as the encoder's does. #EXT-X-KEY follows
  #EXT-X-MAP, so the inits stay plaintext.

The stream goes to android/app/src/main/assets/stream/, which the app serves on
http://127.0.0.1:8765. This script serves the same files on the same address while
make-payload.mjs runs, so the segment URLs in the payload work on the phone unchanged.

Usage: python3 make-sample-stream.py [source-video]
Needs ffmpeg, ffprobe, openssl and node, and `npm run build:libs` done first.
"""

import http.server
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_SOURCE = os.path.join(REPO, "test-media", "trim-test-1080p-4audio.mp4")
OUT = os.path.join(HERE, "android", "app", "src", "main", "assets", "stream")
PORT = 8765

# A spike's key: bundled next to the stream it opens, so it protects nothing.
KEY_HEX = "6c756d696e6172792d737069a4e2c0de"
IV_HEX = "000000000000000000000000000000a1"

SEGMENT_SECONDS = 6
FIRST_CHUNK_SECONDS = 20
LADDER = [(720, 1500), (360, 600), (240, 250)]  # height, kbps
ANGLES = [("Wide", ""), ("Mirror", "hflip,")]
AUDIO_KBPS = 128
THUMB_SECONDS, THUMB_W, THUMB_H, THUMB_COLUMNS, THUMB_ROWS = 2, 160, 90, 10, 6
LANGUAGES = {
    "eng": ("en", "English"), "spa": ("es", "Español"), "fra": ("fr", "Français"),
    "deu": ("de", "Deutsch"), "por": ("pt", "Português"), "afr": ("af", "Afrikaans"),
}


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def probe(path, entries):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", entries, "-of", "json", path],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def encode(source, work, name, args):
    """One stream as ffmpeg's fMP4 HLS; returns its folder and [(duration, segment file)]."""
    folder = os.path.join(work, name)
    os.makedirs(folder)
    run("ffmpeg", "-y", "-i", source, *args,
        "-f", "hls", "-hls_time", str(SEGMENT_SECONDS), "-hls_playlist_type", "vod",
        "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
        "-hls_segment_filename", os.path.join(folder, "seg%d.m4s"), os.path.join(folder, "index.m3u8"))
    playlist = open(os.path.join(folder, "index.m3u8")).read()
    segments = [(float(d), f) for d, f in re.findall(r"#EXTINF:([\d.]+),\s*\n(seg\d+\.m4s)", playlist)]
    return folder, segments


def encrypt(path):
    return subprocess.run(
        ["openssl", "enc", "-aes-128-cbc", "-K", KEY_HEX, "-iv", IV_HEX, "-in", path],
        check=True, capture_output=True,
    ).stdout


def avc_codec(init):
    """`CODECS` from the init's avcC box (profile, constraint flags, level), and its dimensions."""
    data = open(init, "rb").read()
    box = data.index(b"avcC") + 4
    profile, flags, level = data[box + 1], data[box + 2], data[box + 3]
    stream = probe(init, "stream=width,height")["streams"][0]
    return f"avc1.{profile:02x}{flags:02x}{level:02x}", stream["width"], stream["height"]


def pack_chain(chain, streams):
    """
    Encrypts every segment of [streams] into one chain of chunks, interleaved by segment index
    (the order they would arrive in). Writes each stream's media playlist; returns peak and
    average bitrates per stream.
    """
    chunks = [bytearray()]
    content = 0.0
    entries = {name: [] for name, _, _ in streams}
    count = max(len(segments) for _, _, segments in streams)
    for index in range(count):
        for name, folder, segments in streams:
            if index >= len(segments):
                continue
            duration, file = segments[index]
            data = encrypt(os.path.join(folder, file))
            chunk = len(chunks) - 1
            entries[name].append((duration, len(data), len(chunks[chunk]), chunk))
            chunks[chunk] += data
        content += streams[0][2][index][0] if index < len(streams[0][2]) else 0
        if len(chunks) == 1 and content >= FIRST_CHUNK_SECONDS and index < count - 1:
            chunks.append(bytearray())

    os.makedirs(os.path.join(OUT, "media"), exist_ok=True)
    for n, chunk in enumerate(chunks):
        open(os.path.join(OUT, "media", f"{chain}_{n}.m4s"), "wb").write(chunk)

    rates = {}
    for name, folder, _ in streams:
        target = math.ceil(max(d for d, *_ in entries[name]))
        lines = [
            "#EXTM3U", "#EXT-X-VERSION:7", f"#EXT-X-TARGETDURATION:{target}", "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-INDEPENDENT-SEGMENTS", '#EXT-X-MAP:URI="init.mp4"',
            f'#EXT-X-KEY:METHOD=AES-128,URI="luminary://key",IV=0x{IV_HEX}',
        ]
        for duration, length, offset, chunk in entries[name]:
            lines += [f"#EXTINF:{duration:.6f},", f"#EXT-X-BYTERANGE:{length}@{offset}", f"../media/{chain}_{chunk}.m4s"]
        lines.append("#EXT-X-ENDLIST")
        os.makedirs(os.path.join(OUT, name), exist_ok=True)
        shutil.copy(os.path.join(folder, "init.mp4"), os.path.join(OUT, name, "init.mp4"))
        open(os.path.join(OUT, name, "index.m3u8"), "w").write("\n".join(lines) + "\n")
        peak = max(length * 8 / duration for duration, length, *_ in entries[name] if duration > 0.5)
        total = sum(length for _, length, *_ in entries[name]) * 8 / sum(d for d, *_ in entries[name])
        rates[name] = (int(peak), int(total))
    return rates


class Server(http.server.ThreadingHTTPServer):
    # The munge fetches every playlist at once; the default backlog of 5 resets the rest.
    request_queue_size = 64


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=OUT, **kwargs)

    def log_message(self, *args):
        pass


def vtt_time(seconds):
    return f"{int(seconds // 3600):02d}:{int(seconds % 3600 // 60):02d}:{seconds % 60:06.3f}"


def write_lmcenc(path, text):
    """An encrypted session's .vtt: LMCENC01 + a fresh IV + AES-128-CBC of the text."""
    iv = os.urandom(16)
    body = subprocess.run(["openssl", "enc", "-aes-128-cbc", "-K", KEY_HEX, "-iv", iv.hex()],
                          input=text.encode(), capture_output=True, check=True).stdout
    with open(path, "wb") as f:
        f.write(b"LMCENC01" + iv + body)


def write_sidecars(source, duration):
    """thumbnails/, chapters/ and subtitles/ beside the master, as the encoder lays them out."""
    # Scrub frames: one 160x90 frame every THUMB_SECONDS, tiled into sprite sheets.
    thumbs = os.path.join(OUT, "thumbnails")
    os.makedirs(thumbs)
    frames = math.ceil(duration / THUMB_SECONDS)
    per_sheet = THUMB_COLUMNS * THUMB_ROWS
    cues = ["WEBVTT", ""]
    for sheet in range(math.ceil(frames / per_sheet)):
        start = sheet * per_sheet * THUMB_SECONDS
        run("ffmpeg", "-v", "error", "-y", "-ss", str(start), "-i", source, "-an", "-frames:v", "1",
            "-vf", f"fps=1/{THUMB_SECONDS},scale={THUMB_W}:{THUMB_H},tile={THUMB_COLUMNS}x{THUMB_ROWS}",
            "-q:v", "5", os.path.join(thumbs, f"sprite_{sheet}.jpg"))
        for i in range(min(per_sheet, frames - sheet * per_sheet)):
            t = start + i * THUMB_SECONDS
            col, row = i % THUMB_COLUMNS, i // THUMB_COLUMNS
            cues += [f"{vtt_time(t)} --> {vtt_time(min(t + THUMB_SECONDS, duration))}",
                     f"sprite_{sheet}.jpg#xywh={col * THUMB_W},{row * THUMB_H},{THUMB_W},{THUMB_H}", ""]
    write_lmcenc(os.path.join(thumbs, "thumbnails.vtt"), "\n".join(cues))

    # Chapters and subtitles in two languages: enough to exercise switching.
    titles = {"en": ["Opening", "Setup", "Middle", "Turn", "Finale"],
              "es": ["Apertura", "Preparación", "Desarrollo", "Giro", "Final"]}
    lines = {"en": "Subtitle line", "es": "Línea de subtítulo"}
    for sub in ("chapters", "subtitles"):
        os.makedirs(os.path.join(OUT, sub))
    for lang, names in titles.items():
        step = duration / len(names)
        chapters = ["WEBVTT", ""]
        for i, name in enumerate(names):
            chapters += [f"{vtt_time(i * step)} --> {vtt_time((i + 1) * step)}", name, ""]
        write_lmcenc(os.path.join(OUT, "chapters", f"{lang}.vtt"), "\n".join(chapters))
        subs = ["WEBVTT", ""]
        for i in range(int(duration // 4)):
            subs += [f"{vtt_time(i * 4)} --> {vtt_time(i * 4 + 3)}", f"{lines[lang]} {i + 1} ({vtt_time(i * 4)})", ""]
        write_lmcenc(os.path.join(OUT, "subtitles", f"{lang}.vtt"), "\n".join(subs))


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE
    audio_tracks = [s for s in probe(source, "stream=index,codec_type:stream_tags=language")["streams"]
                    if s["codec_type"] == "audio"]
    print(f"source: {source} ({len(audio_tracks)} audio tracks)")
    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)

    with tempfile.TemporaryDirectory() as work:
        variants = []
        video_rates = {}
        for a, (angle, flip) in enumerate(ANGLES):
            streams = []
            for height, kbps in LADDER:
                name = f"angle{a}_{height}"
                print(f"encoding {name}")
                folder, segments = encode(source, work, name, [
                    "-map", "0:v:0", "-an", "-vf", f"{flip}scale=-2:{height},setsar=1",
                    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-b:v", f"{kbps}k", "-maxrate", f"{kbps * 11 // 10}k", "-bufsize", f"{kbps * 2}k",
                    "-g", "180", "-keyint_min", "180", "-sc_threshold", "0",
                    "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
                ])
                codec, width, h = avc_codec(os.path.join(folder, "init.mp4"))
                streams.append((name, folder, segments))
                variants.append((a, name, codec, width, h))
            video_rates.update(pack_chain(f"angle{a}", streams))

        audio_streams = []
        renditions = []
        for i, track in enumerate(audio_tracks):
            tag = track.get("tags", {}).get("language", "und")
            lang, label = LANGUAGES.get(tag, (tag[:2], tag))
            name = f"audio_{lang}"
            print(f"encoding {name}")
            folder, segments = encode(source, work, name, [
                "-map", f"0:a:{i}", "-vn", "-c:a", "aac", "-b:a", f"{AUDIO_KBPS}k", "-ac", "2",
            ])
            audio_streams.append((name, folder, segments))
            renditions.append((name, lang, label))
        audio_rates = pack_chain("audio", audio_streams)
        audio_peak = max(peak for peak, _ in audio_rates.values())
        audio_average = max(average for _, average in audio_rates.values())

    lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"]
    for a, (angle, _) in enumerate(ANGLES):
        lines.append(f'#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="angle_{a}",NAME="{angle}",DEFAULT={"YES" if a == 0 else "NO"}')
    for i, (name, lang, label) in enumerate(renditions):
        default = "YES" if i == 0 else "NO"
        lines.append(f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="{label}",LANGUAGE="{lang}",'
                     f'DEFAULT={default},AUTOSELECT=YES,CHANNELS="2",URI="{name}/index.m3u8"')
    for a, name, codec, width, height in variants:
        peak, average = video_rates[name]
        lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={peak + audio_peak},AVERAGE-BANDWIDTH={average + audio_average},"
                     f'RESOLUTION={width}x{height},FRAME-RATE=30.000,CODECS="{codec},mp4a.40.2",'
                     f'VIDEO="angle_{a}",AUDIO="aud"')
        lines.append(f"{name}/index.m3u8")
    open(os.path.join(OUT, "master.m3u8"), "w").write("\n".join(lines) + "\n")

    write_sidecars(source, float(probe(source, "format=duration")["format"]["duration"]))

    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, files in os.walk(OUT) for f in files)
    print(f"stream: {size / 1024 / 1024:.1f} MiB in {OUT}")

    # The payload, recorded against the same address the app serves the stream on.
    server = Server(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        subprocess.run(["node", os.path.join(HERE, "make-payload.mjs"), "--android",
                        f"http://127.0.0.1:{PORT}/master.m3u8", KEY_HEX], check=True, cwd=HERE)
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
