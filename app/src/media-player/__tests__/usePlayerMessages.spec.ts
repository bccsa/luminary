import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";

const language = vi.hoisted(() => ({ app: null as any, fallback: null as any }));

// The app's own i18n set-up, fed the language documents a test chooses.
vi.mock("@/globalConfig", async () => {
    const { ref } = await import("vue");
    const app = ref(null);
    const fallback = ref(null);
    language.app = app;
    language.fallback = fallback;
    return {
        appLanguageAsRef: app,
        cmsDefaultLanguage: fallback,
        appName: "Test",
        effectiveDataSaverLevel: ref("light"),
    };
});
vi.mock("@/router", () => ({
    default: {
        currentRoute: ref({ name: "home", meta: {} }),
        afterEach: () => {},
        beforeEach: () => {},
    },
}));

import { initI18n } from "@/i18n";
import { useKnownTexts, useNowPlayingDownloadTexts, usePlayerMessages } from "../usePlayerMessages";

let revision = 0;
/** A language document as the server sends it: flat keys with dots in them. A new revision each, as an edit is. */
const doc = (translations: Record<string, string>) => ({
    _id: "lang-fra",
    languageCode: "fr",
    updatedTimeUtc: ++revision,
    translations,
});

async function setUp(translations: Record<string, string>) {
    const i18n = initI18n();
    const document = doc(translations);
    language.app.value = document;
    language.fallback.value = document;
    await nextTick();
    let result: {
        known: ReturnType<typeof useKnownTexts>;
        messages: ReturnType<typeof usePlayerMessages>;
        download: ReturnType<typeof useNowPlayingDownloadTexts>;
        te: (key: string) => boolean;
    } | null = null;
    mount(
        defineComponent({
            setup() {
                result = {
                    known: useKnownTexts(),
                    messages: usePlayerMessages(),
                    download: useNowPlayingDownloadTexts(),
                    te: (key) => i18n.global.te(key),
                };
                return () => h("div");
            },
        }),
        { global: { plugins: [i18n] } },
    );
    return result!;
}

describe("usePlayerMessages with the app's i18n", () => {
    it("vue-i18n's te() does not find the app's flat dotted keys, so it cannot tell which texts exist", async () => {
        const { te } = await setUp({ "media_player.autoplay": "Lecture auto" });
        expect(te("media_player.autoplay")).toBe(false);
    });

    it("finds a text the language has, and leaves out one it lacks", async () => {
        const { known } = await setUp({ "media_player.autoplay": "Lecture auto" });
        expect(known.known("media_player.autoplay")).toBe("Lecture auto");
        expect(known.known("media_player.not_there")).toBeUndefined();
        expect(known.textOr("media_player.not_there", "English")).toBe("English");
        expect(known.textOr("media_player.autoplay", "Autoplay")).toBe("Lecture auto");
    });

    it("keeps a placeholder for the player to fill in", async () => {
        const { known } = await setUp({ "media_player.sleep_left": "{minutes} min restantes" });
        expect(known.known("media_player.sleep_left", { minutes: "{minutes}" })).toBe(
            "{minutes} min restantes",
        );
    });

    it("serves the player's optional texts in the language, not the player's English", async () => {
        const { messages } = await setUp({
            "media_player.autoplay": "Lecture auto",
            "media_player.replay": "Revoir",
            "media_player.data_saver_default": "Par défaut : {level}",
            "settings.data_saver.light": "Léger",
        });
        // The optional texts are left out of the type where the language lacks them.
        const texts: Record<string, string> = messages.value;
        expect(texts.autoplay).toBe("Lecture auto");
        expect(texts.replay).toBe("Revoir");
        expect(texts.dataSaverDefault).toBe("Par défaut : Léger");
        expect("playNow" in texts).toBe(false);
    });

    it("gives the player the downloaded word for full screen, only where the language has it", async () => {
        const { messages } = await setUp({ "downloads.now_playing.downloaded": "Téléchargé" });
        expect((messages.value as Record<string, string>).downloaded).toBe("Téléchargé");

        const { messages: without } = await setUp({ "media_player.autoplay": "Lecture auto" });
        expect("downloaded" in without.value).toBe(false);
    });

    it("serves the now-playing screen's download texts the language has", async () => {
        const { download } = await setUp({
            "downloads.now_playing.download": "Télécharger",
            "downloads.now_playing.download_progress": "Téléchargement, {percent} %",
        });
        expect(download.value).toEqual({
            download: "Télécharger",
            downloadProgress: "Téléchargement, {percent} %",
        });
    });
});
