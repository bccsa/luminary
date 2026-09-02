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

    it("re-checks shortly after the launch link is followed", async () => {
        const wrapper = mountStatus({ availability: "unavailable" });

        await wrapper.find('[data-test="encoder-launch"]').trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 2100));

        expect(wrapper.emitted("recheck")).toHaveLength(1);
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

    it("says nothing when the encoder is simply there", () => {
        expect(mountStatus().find('[data-test="media-notice"]').exists()).toBe(false);
    });
});
