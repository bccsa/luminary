import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled, youtubeAlwaysAllow } from "@/globalConfig";
import YouTubeEmbed from "./YouTubeEmbed.vue";

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function mountEmbed() {
    return mount(YouTubeEmbed, {
        props: { content: mockEnglishContentDto, url: URL },
        global: { stubs: { LImage: true } },
    });
}

beforeEach(() => {
    youtubeAlwaysAllow.value = false;
    userDataSaverEnabled.value = false;
});

describe("YouTubeEmbed", () => {
    it("loads nothing from YouTube until the viewer chooses", () => {
        const wrapper = mountEmbed();

        expect(wrapper.find("[data-test='youtubeFrame']").exists()).toBe(false);
        expect(wrapper.find("iframe").exists()).toBe(false);
        expect(wrapper.html()).not.toContain("youtube-nocookie.com");
        expect(wrapper.find("[data-test='youtubeNotice']").exists()).toBe(true);
    });

    it("plays through the privacy-enhanced domain once Play is pressed", async () => {
        const wrapper = mountEmbed();
        await wrapper.get("[data-test='youtubePlay']").trigger("click");

        const frame = wrapper.get("[data-test='youtubeFrame']");
        expect(frame.attributes("src")).toContain(
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        );
        expect(frame.attributes("src")).not.toContain("://www.youtube.com");
        expect(wrapper.find("[data-test='youtubeNotice']").exists()).toBe(false);
        // Pressing Play once does not allow the next video.
        expect(youtubeAlwaysAllow.value).toBe(false);
    });

    it("remembers the choice when the box is ticked", async () => {
        const wrapper = mountEmbed();
        await wrapper.get("[data-test='youtubeRemember']").setValue(true);
        await wrapper.get("[data-test='youtubePlay']").trigger("click");

        expect(youtubeAlwaysAllow.value).toBe(true);
        expect(localStorage.getItem("youtubeAlwaysAllow")).toBe("true");
    });

    it("loads straight away for a viewer who always allows it", () => {
        youtubeAlwaysAllow.value = true;
        const wrapper = mountEmbed();

        expect(wrapper.find("[data-test='youtubeFrame']").exists()).toBe(true);
    });

    it("never plays by itself under Data Saver, even when always allowed", async () => {
        youtubeAlwaysAllow.value = true;
        userDataSaverEnabled.value = true;
        const wrapper = mountEmbed();

        expect(wrapper.find("[data-test='youtubeFrame']").exists()).toBe(false);
        await wrapper.get("[data-test='youtubePlay']").trigger("click");
        await nextTick();
        expect(wrapper.find("[data-test='youtubeFrame']").exists()).toBe(true);
    });

    it("offers a way out to YouTube itself", () => {
        const wrapper = mountEmbed();
        const open = wrapper.get("[data-test='youtubeOpen']");

        expect(open.attributes("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        expect(open.attributes("rel")).toContain("noopener");
    });
});
