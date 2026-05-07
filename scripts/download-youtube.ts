#!/usr/bin/env -S npx --yes tsx

/**
 * download-youtube.ts
 *
 * Downloads English and Norwegian audio tracks and subtitles from a YouTube
 * video using yt-dlp. Before downloading the script verifies that yt-dlp is
 * installed and updates it to the latest available version.
 *
 * Usage:
 *   ./download-youtube.ts <youtube-url> [output-dir]
 *   npx tsx download-youtube.ts <youtube-url> [output-dir]
 *
 * Requirements:
 *   - yt-dlp  (https://github.com/yt-dlp/yt-dlp)
 *   - ffmpeg  (used by yt-dlp to merge / convert streams)
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

const AUDIO_LANGUAGES = ["en", "no"] as const;
const SUBTITLE_LANGUAGES = "en,no,nb,nn";

type Lang = (typeof AUDIO_LANGUAGES)[number];

function runInherit(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(cmd, args, { stdio: "inherit" });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolvePromise();
            else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
        });
    });
}

async function commandExists(cmd: string): Promise<boolean> {
    try {
        await execFileAsync(process.platform === "win32" ? "where" : "which", [cmd]);
        return true;
    } catch {
        return false;
    }
}

async function getYtDlpVersion(): Promise<string> {
    const { stdout } = await execFileAsync("yt-dlp", ["--version"]);
    return stdout.trim();
}

async function ensureYtDlp(): Promise<void> {
    if (!(await commandExists("yt-dlp"))) {
        throw new Error(
            "yt-dlp is not installed. Install it with one of:\n" +
                "  pip install -U yt-dlp\n" +
                "  brew install yt-dlp\n" +
                "  sudo apt install yt-dlp",
        );
    }
    if (!(await commandExists("ffmpeg"))) {
        console.warn("Warning: ffmpeg not found. yt-dlp may fail to merge or convert streams.");
    }
}

async function updateYtDlp(): Promise<void> {
    const before = await getYtDlpVersion();
    console.log(`Current yt-dlp version: ${before}`);
    console.log("Checking for updates...");
    try {
        await runInherit("yt-dlp", ["-U"]);
    } catch (err) {
        console.warn(`yt-dlp self-update failed (continuing with installed version): ${(err as Error).message}`);
    }
    const after = await getYtDlpVersion();
    if (after !== before) {
        console.log(`Updated yt-dlp: ${before} -> ${after}`);
    } else {
        console.log(`yt-dlp is up to date (${after}).`);
    }
}

async function downloadAudio(url: string, lang: Lang, outDir: string): Promise<void> {
    console.log(`\n=== Downloading "${lang}" audio track ===`);
    await runInherit("yt-dlp", [
        "--no-playlist",
        "--extract-audio",
        "--audio-format", "m4a",
        "--audio-quality", "0",
        // Prefer the audio stream tagged with the requested language; fall back
        // to the default audio when language metadata is missing.
        "-f", `bestaudio[language=${lang}]/bestaudio`,
        "-o", resolve(outDir, `%(title).200B [%(id)s].${lang}.%(ext)s`),
        url,
    ]);
}

async function downloadSubtitles(url: string, outDir: string): Promise<void> {
    console.log(`\n=== Downloading subtitles (${SUBTITLE_LANGUAGES}) ===`);
    await runInherit("yt-dlp", [
        "--no-playlist",
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", SUBTITLE_LANGUAGES,
        "--sub-format", "srt/vtt/best",
        "--convert-subs", "srt",
        "-o", resolve(outDir, "%(title).200B [%(id)s].%(ext)s"),
        url,
    ]);
}

function parseArgs(argv: string[]): { url: string; outDir: string } {
    const args = argv.slice(2).filter((a) => a !== "--");
    if (args.length < 1 || args[0] === "-h" || args[0] === "--help") {
        console.log("Usage: download-youtube.ts <youtube-url> [output-dir]");
        process.exit(args.length < 1 ? 1 : 0);
    }
    const [url, outDir = "./downloads"] = args;
    try {
        // Throws on invalid URL.
        new URL(url);
    } catch {
        console.error(`Invalid URL: ${url}`);
        process.exit(1);
    }
    return { url, outDir: resolve(outDir) };
}

async function main(): Promise<void> {
    const { url, outDir } = parseArgs(process.argv);

    await ensureYtDlp();
    await updateYtDlp();
    await mkdir(outDir, { recursive: true });

    console.log(`\nOutput directory: ${outDir}`);
    console.log(`Source: ${url}`);

    for (const lang of AUDIO_LANGUAGES) {
        try {
            await downloadAudio(url, lang, outDir);
        } catch (err) {
            console.error(`Failed to download "${lang}" audio: ${(err as Error).message}`);
        }
    }

    try {
        await downloadSubtitles(url, outDir);
    } catch (err) {
        console.error(`Failed to download subtitles: ${(err as Error).message}`);
    }

    console.log(`\nDone. Files saved to ${outDir}`);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
