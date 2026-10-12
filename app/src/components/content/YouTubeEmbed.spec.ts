import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled, youtubeAlwaysAllow } from "@/globalConfig";
import YouTubeEmbed from "./YouTubeEmbed.vue";

const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const hostedOrigin = vi.hoisted(() => ({ value: "" }));
vi.mock("@/seo/publicSite", () => ({
    publicUrl: (path: string) => (hostedOrigin.value ? `${hostedOrigin.value}${path}` : undefined),
}));

type Exposed = {
    state?: {
        lifecycle: string;
        playing: boolean;
        currentTime: number;
        duration: number;
        error: { message: string } | null;
    };
    controller: { setPlaybackRate(rate: number): void } | null;
    pause(): void;
    seek(seconds: number): void;
    setMuted(muted: boolean): void;
};

function mountEmbed(attach = false) {
    return mount(YouTubeEmbed, {
        props: { content: mockEnglishContentDto, url: URL },
        global: { stubs: { LImage: true } },
        ...(attach ? { attachTo: document.body } : {}),
    });
}

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
        // The link out is the only mention of YouTube, and a link loads nothing.
        expect(wrapper.html()).not.toContain("youtube-nocookie");
        expect(wrapper.html()).not.toContain("youtube-embed");
        expect(wrapper.find("script, img[src*='youtube'], iframe").exists()).toBe(false);
        expect(wrapper.find("[data-test='youtubeNotice']").exists()).toBe(true);
    });

    it("frames the hosted page, with YouTube's controls off, once Play is pressed", async () => {
        const wrapper = mountEmbed();
        await wrapper.get("[data-test='youtubePlay']").trigger("click");

        const src = wrapper.get("[data-test='youtubeFrame']").attributes("src");
        expect(src).toContain("/youtube-embed.html?v=dQw4w9WgXcQ&api=1");
        expect(src).not.toContain("://www.youtube.com");
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
                "https://app.example.org/youtube-embed.html?v=dQw4w9WgXcQ&api=1",
            );
        });

        it("falls back to YouTube's own embed, with its controls, where no web address is set", async () => {
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            const wrapper = mountEmbed();
            await wrapper.get("[data-test='youtubePlay']").trigger("click");

            expect(wrapper.get("[data-test='youtubeFrame']").attributes("src")).toContain(
                "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            );
            expect((wrapper.vm as unknown as Exposed).state).toBeUndefined();
        });

        it("uses this page's own origin in a browser, whatever the web address", async () => {
            hostedOrigin.value = "https://app.example.org";
            const wrapper = mountEmbed();
            await wrapper.get("[data-test='youtubePlay']").trigger("click");

            expect(wrapper.get("[data-test='youtubeFrame']").attributes("src")).not.toContain(
                "app.example.org",
            );
        });
    });

    describe("driven from the page", () => {
        async function playing() {
            const wrapper = mountEmbed(true);
            await wrapper.get("[data-test='youtubePlay']").trigger("click");
            const frame = wrapper.get("[data-test='youtubeFrame']").element as HTMLIFrameElement;
            const posted: unknown[] = [];
            vi.spyOn(frame.contentWindow!, "postMessage").mockImplementation((message: unknown) => {
                posted.push(message);
            });
            const report = (
                data: unknown,
                source: unknown = frame.contentWindow,
                origin = window.location.origin,
            ) =>
                window.dispatchEvent(
                    new MessageEvent("message", { data, source: source as Window, origin }),
                );
            return { wrapper, posted, report, exposed: wrapper.vm as unknown as Exposed };
        }

        it("has no state until the viewer has chosen, and then reports as a player does", async () => {
            expect((mountEmbed().vm as unknown as Exposed).state).toBeUndefined();

            const { wrapper, report, exposed } = await playing();
            expect(exposed.state?.lifecycle).toBe("loading");

            report({ src: "lmc-yt", type: "ready", status: -1, duration: 212 });
            report({
                src: "lmc-yt",
                type: "state",
                status: 1,
                currentTime: 12,
                duration: 212,
                loaded: 0.5,
            });

            expect(exposed.state?.lifecycle).toBe("ready");
            expect(exposed.state?.playing).toBe(true);
            expect(exposed.state?.currentTime).toBe(12);
            expect(exposed.state?.duration).toBe(212);
            wrapper.unmount();
        });

        it("keeps touches off the picture, so the page's own controls are the only ones", async () => {
            const { wrapper } = await playing();
            expect(wrapper.find("[data-test='youtubeShield']").exists()).toBe(true);
            wrapper.unmount();

            // Where the frame is YouTube's own embed, its controls are the only ones there are.
            vi.stubEnv("VITE_BUILD_TARGET", "native");
            const plain = mountEmbed();
            await plain.get("[data-test='youtubePlay']").trigger("click");
            expect(plain.find("[data-test='youtubeShield']").exists()).toBe(false);
        });

        it("tells the page what the viewer pressed", async () => {
            const { wrapper, posted, exposed } = await playing();
            exposed.pause();
            exposed.seek(90);
            exposed.controller?.setPlaybackRate(1.5);
            exposed.setMuted(true);

            expect(posted).toEqual([
                { src: "lmc-yt", cmd: "pause" },
                { src: "lmc-yt", cmd: "seek", value: 90 },
                { src: "lmc-yt", cmd: "rate", value: 1.5 },
                { src: "lmc-yt", cmd: "mute" },
            ]);
            wrapper.unmount();
        });

        it("emits the time and the end for the page's watch tracking", async () => {
            const { wrapper, report } = await playing();
            report({ src: "lmc-yt", type: "time", status: 1, currentTime: 40, duration: 100 });
            report({ src: "lmc-yt", type: "state", status: 0, currentTime: 100, duration: 100 });

            expect(wrapper.emitted("loadedmetadata")).toHaveLength(1);
            expect(wrapper.emitted("timeupdate")?.[0]).toEqual([40, 100]);
            expect(wrapper.emitted("ended")).toHaveLength(1);
            wrapper.unmount();
        });

        it("says so when YouTube cannot play it", async () => {
            const { wrapper, report, exposed } = await playing();
            report({ src: "lmc-yt", type: "error", code: 101 });

            expect(exposed.state?.lifecycle).toBe("error");
            expect(exposed.state?.error?.message).toContain("does not allow");
            wrapper.unmount();
        });

        it("ignores messages from anywhere but its own frame and the hosted origin", async () => {
            const { wrapper, report, exposed } = await playing();

            report(
                { src: "lmc-yt", type: "time", status: 1, currentTime: 77, duration: 100 },
                window,
            );
            report(
                { src: "lmc-yt", type: "time", status: 1, currentTime: 78, duration: 100 },
                undefined,
                "https://evil.example",
            );
            report({ type: "time", currentTime: 79 });

            expect(exposed.state?.currentTime).toBe(0);
            wrapper.unmount();
        });
    });
});
