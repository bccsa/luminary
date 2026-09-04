import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EncodeStatus from "./EncodeStatus.vue";

const mountStatus = (props = {}) =>
    mount(EncodeStatus, {
        props: { availability: "available" as const, ...props },
    });

describe("EncodeStatus progress", () => {
    it("gives a running encode a bar, not a line of small grey text", () => {
        const wrapper = mountStatus({ status: "encoding", progress: 42 });
        const bar = wrapper.find('[data-test="encoder-progress-bar"]');

        expect(bar.exists()).toBe(true);
        expect(bar.attributes("style")).toContain("42%");
        expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Encoding 42%");
    });

    /*
     * Segments upload as they are packed, so the session status stays "encoding"
     * until only the playlists are left — which read as "Encoding" here while the
     * encoder's own window showed an upload bar moving.
     */
    describe("once encoding is done and only the upload is moving", () => {
        it("says Uploading, with the upload's own percentage", () => {
            const wrapper = mountStatus({
                status: "encoding",
                progress: 100,
                pipelineProgress: { encoding: 100, uploading: 53 },
            });

            expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Uploading 53%");
            expect(wrapper.find('[data-test="encoder-progress-bar"]').attributes("style")).toContain(
                "53%",
            );
        });

        it("still says Encoding while the two are running together", () => {
            // Encoding is the honest answer while it is still producing segments.
            const wrapper = mountStatus({
                status: "encoding",
                progress: 62,
                pipelineProgress: { encoding: 62, uploading: 20 },
            });

            expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Encoding 62%");
        });

        it("hands back to the session status once the upload has finished", () => {
            const wrapper = mountStatus({
                status: "encoding",
                progress: 100,
                pipelineProgress: { encoding: 100, uploading: 100 },
            });

            expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Encoding");
        });

        it("is unaffected by an encoder that sends no pipeline detail", () => {
            // Older encoders, and any frame before the pipeline starts reporting.
            const wrapper = mountStatus({ status: "encoding", progress: 42 });

            expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Encoding 42%");
        });
    });

    it("translates the encoder's statuses out of snake_case", () => {
        const wrapper = mountStatus({ status: "uploading_to_s3", progress: 10 });

        expect(wrapper.find('[data-test="encoder-status"]').text()).toContain("Uploading 10%");
    });

    it("shows a finished encode without a redundant percentage", () => {
        const wrapper = mountStatus({ status: "completed", progress: 100 });
        const text = wrapper.find('[data-test="encoder-status"]').text();

        expect(text).toContain("Encoded");
        expect(text).not.toContain("100%");
        expect(wrapper.find('[data-test="encoder-progress-bar"]').exists()).toBe(false);
    });

    it("says leaving the page is safe, which it now is", () => {
        const wrapper = mountStatus({ status: "encoding", progress: 5 });

        expect(wrapper.find('[data-test="encoder-leave-hint"]').exists()).toBe(true);
    });

    it("does not promise that about a finished encode", () => {
        const wrapper = mountStatus({ status: "completed" });

        expect(wrapper.find('[data-test="encoder-leave-hint"]').exists()).toBe(false);
    });

    it("shows nothing at all before a session has started", () => {
        expect(mountStatus().find('[data-test="encoder-status"]').exists()).toBe(false);
    });
});

/**
 * One notice idiom for every reason the encoder cannot be used, with the message
 * readable rather than truncated into a title attribute.
 */
describe("EncodeStatus notices", () => {
    it("offers a launch link when the encoder is merely closed", () => {
        const wrapper = mountStatus({ availability: "unavailable" });

        expect(wrapper.find('[data-test="encoder-unavailable"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encoder-launch"]').exists()).toBe(true);
    });

    it("asks for the encoder to be opened before blaming the browser", () => {
        // Whether a non-Chromium browser genuinely cannot reach the encoder is
        // unverified (#1979). Not running is the likelier cause and the one the
        // editor can act on, so it leads and the launch link is offered.
        const wrapper = mountStatus({ availability: "browser-unsupported" });
        const notice = wrapper.find('[data-test="encoder-browser-unsupported"]');

        expect(notice.text()).toContain("did not answer");
        expect(wrapper.find('[data-test="encoder-launch"]').exists()).toBe(true);
    });

    it("still names Chrome as the browser it is known to work in", () => {
        const wrapper = mountStatus({ availability: "browser-unsupported" });

        expect(wrapper.find('[data-test="encoder-browser-unsupported"]').text()).toContain(
            "Chrome",
        );
    });

    it("says the notice updates itself, rather than asking for another try", () => {
        // The owner polls while the encoder is missing, so an editor who opens the
        // app — from this link or from the Dock — does not have to do anything else.
        const wrapper = mountStatus({ availability: "unavailable" });

        expect(wrapper.find('[data-test="encoder-unavailable"]').text()).toContain(
            "updates on its own",
        );
    });

    it("shows a failure in full rather than truncated into a tooltip", () => {
        const message = "Luminary Media Convert has not been allowed to work with this site.";
        const wrapper = mountStatus({ availability: "available", error: message });

        expect(wrapper.find('[data-test="encoder-error"]').text()).toContain(message);
    });

    it("leads with the failure rather than the availability behind it", () => {
        const wrapper = mountStatus({ availability: "unavailable", error: "Something broke" });

        expect(wrapper.find('[data-test="encoder-error"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encoder-unavailable"]').exists()).toBe(false);
    });

    it("offers the download when the encoder cannot be reached at all", () => {
        // The one notice a first-time editor sees. Before this it only said
        // "Open it" — a protocol link nothing has registered on a machine that
        // has never had the app, so the click did nothing and there was no way
        // to get it from here.
        const wrapper = mountStatus({ availability: "unavailable" });
        const download = wrapper.find('[data-test="encoder-download"]');

        expect(download.exists()).toBe(true);
        expect(download.attributes("href")).toContain("releases");
    });

    it("offers the download when the browser cannot reach it either", () => {
        const wrapper = mountStatus({ availability: "browser-unsupported" });

        expect(wrapper.find('[data-test="encoder-download"]').exists()).toBe(true);
    });

    it("opens the download away from the CMS, without handing it the opener", () => {
        const download = mountStatus({ availability: "unavailable" }).find(
            '[data-test="encoder-download"]',
        );

        expect(download.attributes("target")).toBe("_blank");
        expect(download.attributes("rel")).toContain("noopener");
    });

    it("says nothing when the encoder is simply there", () => {
        expect(mountStatus().find('[data-test="media-notice"]').exists()).toBe(false);
    });

    it("asks for a new download when the encoder is outdated", () => {
        const wrapper = mountStatus({ outdated: true });
        const notice = wrapper.find('[data-test="encoder-outdated"]');

        expect(notice.text()).toContain("outdated");
        expect(wrapper.find('[data-test="encoder-download"]').attributes("href")).toContain(
            "releases",
        );
    });

    it("does not say 'not running' about an encoder that answered but is old", () => {
        // Outdated is only ever set when the health check succeeded, so the two
        // notices cannot truthfully show together.
        const wrapper = mountStatus({ availability: "unavailable", outdated: true });

        expect(wrapper.find('[data-test="encoder-outdated"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encoder-unavailable"]').exists()).toBe(false);
    });
});
