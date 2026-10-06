import { describe, expect, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { mockEnglishContentDto } from "@/tests/mockdata";
import MediaAction from "../MediaAction.vue";
import { mediaPlayerItem, mediaPlayerView } from "../mediaPlayer";

import { userDataSaverEnabled } from "@/globalConfig";

const i18n = createI18n({
    legacy: false,
    locale: "eng",
    messages: { eng: { "media_player.watch": "Watch", "media_player.listen": "Listen" } },
});

const mountAction = () =>
    mount(MediaAction, {
        props: { content: mockEnglishContentDto, language: "eng" },
        global: { plugins: [i18n] },
    });

describe("MediaAction", () => {
    beforeEach(() => {
        userDataSaverEnabled.value = false;
        mediaPlayerItem.value = null;
        mediaPlayerView.value = "mini";
    });

    it("offers to watch, and opens the media player on the content", async () => {
        const wrapper = mountAction();
        expect(wrapper.text()).toBe("Watch");

        await wrapper.find("[data-test='mediaAction']").trigger("click");
        expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
        expect(mediaPlayerItem.value?.language).toBe("eng");
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("offers to listen when Data Saver starts the sound only", () => {
        userDataSaverEnabled.value = true;
        expect(mountAction().text()).toBe("Listen");
    });
});
