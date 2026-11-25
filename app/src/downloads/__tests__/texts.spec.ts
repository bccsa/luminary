import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import {
    formatBytes,
    notificationTexts,
    nowPlayingDownloadTexts,
    sheetTexts,
    type Translator,
} from "../texts";

const here = path.dirname(fileURLToPath(import.meta.url));
const seeds = path.resolve(here, "../../../../api/src/db/seedingDocs");
const read = (file: string) =>
    JSON.parse(readFileSync(path.join(seeds, file), "utf-8")).translations as Record<
        string,
        string
    >;
const english = read("lang-eng.json");
const french = read("lang-fra.json");

function translatorFor(messages: Record<string, string>): Translator {
    const i18n = createI18n({
        legacy: false,
        locale: "x",
        messages: { x: messages },
        missingWarn: false,
        fallbackWarn: false,
    });
    return { t: (key, params) => i18n.global.t(key, params ?? {}) };
}

/** Every literal downloads key the downloads code names. */
function keysInCode(): string[] {
    const dir = path.resolve(here, "..");
    const files = readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter(
        (f) => /\.(ts|vue)$/.test(f) && !f.includes("__tests__"),
    );
    const keys = new Set<string>();
    for (const file of files) {
        const source = readFileSync(path.join(dir, file), "utf-8");
        for (const match of source.matchAll(
            /["'`](downloads\.[a-z_]+\.[a-z_.]+|downloads\.title)["'`]/g,
        )) {
            keys.add(match[1]);
        }
    }
    return [...keys];
}

describe("downloads strings", () => {
    it("has every key the code names, in English and in French", () => {
        const keys = keysInCode();
        expect(keys.length).toBeGreaterThan(50);
        for (const key of keys) {
            expect(english[key], key).toBeTypeOf("string");
            expect(french[key], key).toBeTypeOf("string");
        }
        for (const status of ["queued", "downloading", "complete", "failed", "revoked"]) {
            expect(english[`downloads.status.${status}`]).toBeTypeOf("string");
        }
    });

    it("names every downloads key in snake_case, so the scan above sees it", () => {
        const dir = path.resolve(here, "..");
        const files = readdirSync(dir, { recursive: true, encoding: "utf-8" }).filter(
            (f) => /\.(ts|vue)$/.test(f) && !f.includes("__tests__"),
        );
        const camel = files.flatMap((file) =>
            [
                ...readFileSync(path.join(dir, file), "utf-8").matchAll(
                    /["'`](downloads\.[A-Za-z_.]*[A-Z][A-Za-z_.]*)["'`]/g,
                ),
            ].map((match) => match[1]),
        );
        expect(camel).toEqual([]);
    });

    it("builds every sheet, notification and now-playing text, keeping the platform's placeholders", () => {
        const translator = translatorFor(french);
        const sheet = sheetTexts(translator);
        expect(Object.keys(sheet)).toHaveLength(53);
        expect(sheet.freeSpace).toBe("{size} libres");
        expect(sheet.removeMessage).toBe("« {title} » sera supprimé de cet appareil.");
        expect(sheetTexts(translator, { playing: true }).removeMessage).toBe(
            "« {title} » est en cours de lecture. Le supprimer continuera sa lecture en ligne, ce qui utilise des données.",
        );

        const notification = notificationTexts(translator, "Titre");
        expect(Object.keys(notification)).toHaveLength(15);
        expect(notification.title).toBe("Titre");
        expect(notification.progress).toBe("{done} sur {total} · {percent} %");

        const nowPlaying = nowPlayingDownloadTexts(translatorFor(english));
        expect(Object.keys(nowPlaying)).toHaveLength(14);
        expect(nowPlaying.downloadProgress).toBe("Downloading, {percent}%");
    });

    it("leaves out keys the language does not have, so the platform's English stands in", () => {
        const translator = translatorFor({ "downloads.sheet.title": "Download" });
        expect(sheetTexts(translator)).toEqual({ title: "Download" });
        expect(notificationTexts(translator, "Item")).toEqual({ title: "Item" });
        expect(sheetTexts(undefined)).toEqual({});
    });

    it("formats sizes for people", () => {
        expect(formatBytes(850_000_000, "en")).toBe("850 MB");
        expect(formatBytes(1_234_000_000, "en")).toBe("1.2 GB");
        expect(formatBytes(0, "en")).toBe("0 byte");
    });
});
