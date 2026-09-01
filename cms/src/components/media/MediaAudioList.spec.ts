import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    useSharedHybridQuery: () =>
        ref([
            { _id: "lang-en", name: "English", languageCode: "en" },
            { _id: "lang-fr", name: "Français", languageCode: "fr" },
        ]),
}));

import MediaAudioList from "./MediaAudioList.vue";

const parentWith = (collections: unknown[]) =>
    ({ _id: "post-1", media: { fileCollections: collections } }) as any;

const mountList = (collections: unknown[]) =>
    mount(MediaAudioList, { props: { parent: parentWith(collections) } });

const FR = { fileUrl: "audio-fr.mp3", languageId: "lang-fr" };
const EN = { fileUrl: "audio-en.mp3", languageId: "lang-en" };

/**
 * Audio can no longer be added from the CMS, but the app still plays what is on a
 * document, so an editor has to be able to see what a reader hears.
 */
describe("MediaAudioList", () => {
    it("names each track's language rather than leaving a two-letter badge to carry it", () => {
        const text = mountList([EN, FR]).text();

        expect(text).toContain("English");
        expect(text).toContain("Français");
    });

    it("lists tracks by language name, whatever order the document holds them in", () => {
        const names = mountList([FR, EN])
            .findAll('[data-test="audio-track"]')
            .map((row) => row.text());

        expect(names[0]).toContain("English");
        expect(names[1]).toContain("Français");
    });

    it("says what the list is, since nothing here can change it", () => {
        expect(mountList([EN]).find('[data-test="audio-note"]').text()).toContain("Read-only");
    });

    it("offers no delete, because the one that was here never deleted anything", () => {
        const wrapper = mountList([EN]);

        expect(wrapper.html()).not.toContain("Delete");
        expect(wrapper.find('[data-test="audio-delete"]').exists()).toBe(false);
    });

    it("gives every track a play control", () => {
        expect(mountList([EN, FR]).findAll('[data-test="audio-play"]')).toHaveLength(2);
    });

    it("disables the control for a file that will not load", async () => {
        const wrapper = mountList([EN]);

        await wrapper.find("audio").trigger("error");

        expect(wrapper.find('[data-test="audio-play"]').attributes("disabled")).toBeDefined();
    });

    it("names an unknown language rather than rendering a blank row", () => {
        const wrapper = mountList([{ fileUrl: "a.mp3", languageId: "lang-gone" }]);

        expect(wrapper.find('[data-test="audio-track"]').text()).toContain("Unknown language");
    });

    it("is absent entirely on a document with no audio", () => {
        expect(mountList([]).find('[data-test="audio-list"]').exists()).toBe(false);
    });
});
