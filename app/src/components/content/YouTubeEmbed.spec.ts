import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const hostedOrigin = vi.hoisted(() => ({ value: "" }));
vi.mock("@/seo/publicSite", () => ({
    publicUrl: (path: string) => (hostedOrigin.value ? `${hostedOrigin.value}${path}` : undefined),
}));

afterEach(() => {
    vi.unstubAllEnvs();
    hostedOrigin.value = "";
});

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

    describe("in the packaged app", () => {
        it("frames the page on the web app's own address, which YouTube accepts", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            hostedOrigin.value = "https://app.example.org";
            const wrapper = mountEmbed();
            await wrapper.get("[data-test='youtubePlay']").trigger("click");

            expect(wrapper.get("[data-test='youtubeFrame']").attributes("src")).toBe(
                "https://app.example.org/youtube-embed.html?v=dQw4w9WgXcQ",
            );
        });

        it("falls back to the embed itself where no web address is set", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            const wrapper = mountEmbed();
            await wrapper.get("[data-test='youtubePlay']").trigger("click");

            expect(wrapper.get("[data-test='youtubeFrame']").attributes("src")).toContain(
                "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            );
        });

        it("uses the embed directly in a browser, whatever the web address", async () => {
            hostedOrigin.value = "https://app.example.org";
            const wrapper = mountEmbed();
            await wrapper.get("[data-test='youtubePlay']").trigger("click");

            expect(wrapper.get("[data-test='youtubeFrame']").attributes("src")).toContain(
                "youtube-nocookie.com",
            );
        });
    });
});
