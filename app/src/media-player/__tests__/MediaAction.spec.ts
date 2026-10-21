import { describe, expect, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { mockEnglishContentDto } from "@/tests/mockdata";
import MediaAction from "../MediaAction.vue";
import { mediaPlayerItem, mediaPlayerView } from "../mediaPlayer";

const i18n = createI18n({
    legacy: false,
    locale: "eng",
    messages: {
        eng: {
            "media_player.watch": "Watch",
            "media_player.listen": "Listen",
        },
    },
});

const mountAction = () =>
    mount(MediaAction, {
        props: { content: mockEnglishContentDto, language: "eng" },
        global: { plugins: [i18n] },
    });

describe("MediaAction", () => {
    beforeEach(() => {
        mediaPlayerItem.value = null;
        mediaPlayerView.value = "mini";
    });

    it("offers to watch or to listen", () => {
        const wrapper = mountAction();
        expect(wrapper.find("[data-test='mediaWatch']").text()).toBe("Watch");
        expect(wrapper.find("[data-test='mediaListen']").text()).toBe("Listen");
    });

    it("watching opens the media player on the content with its picture", async () => {
        await mountAction().find("[data-test='mediaWatch']").trigger("click");
        expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
        expect(mediaPlayerItem.value?.language).toBe("eng");
        expect(mediaPlayerItem.value?.audio).toBe(false);
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("listening opens the media player with the sound only", async () => {
        await mountAction().find("[data-test='mediaListen']").trigger("click");
        expect(mediaPlayerItem.value?.audio).toBe(true);
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("listening to what already plays switches it to the sound only", async () => {
        const wrapper = mountAction();
        await wrapper.find("[data-test='mediaWatch']").trigger("click");
        const playing = mediaPlayerItem.value;
        await wrapper.find("[data-test='mediaListen']").trigger("click");
        expect(mediaPlayerItem.value?.content).toBe(playing?.content);
        expect(mediaPlayerItem.value?.audio).toBe(true);
    });
});
