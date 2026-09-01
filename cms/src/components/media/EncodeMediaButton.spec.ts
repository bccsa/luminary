import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import EncodeMediaButton from "./EncodeMediaButton.vue";

const encoderState = {
    availability: ref("available"),
    encoderVersion: ref<string | undefined>("0.0.1"),
    busy: ref(false),
    status: ref<string | undefined>(undefined),
    progress: ref<number | undefined>(undefined),
    error: ref<string | undefined>(undefined),
    sessionId: ref<string | undefined>(undefined),
    refreshAvailability: vi.fn().mockResolvedValue(true),
    start: vi.fn(),
    resume: vi.fn().mockResolvedValue(false),
    stop: vi.fn(),
};

vi.mock("@/composables/useMediaEncoder", () => ({
    useMediaEncoder: () => encoderState,
}));

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({ autoSelectMediaBucket: ref("bucket-1") }),
}));

const mountButton = (props = {}) =>
    mount(EncodeMediaButton, {
        props: { documentId: "post-1", title: "Episode 12", ...props },
    });

beforeEach(() => {
    encoderState.availability.value = "available";
    encoderState.busy.value = false;
    encoderState.status.value = undefined;
    encoderState.progress.value = undefined;
    encoderState.error.value = undefined;
    encoderState.start.mockClear();
    encoderState.resume.mockClear();
});

describe("EncodeMediaButton status text", () => {
    it("separates the status from the percentage while encoding", () => {
        encoderState.status.value = "encoding";
        encoderState.progress.value = 42;

        const text = mountButton().find('[data-test="encoder-status"]').text();

        expect(text).toBe("Encoding 42%");
    });

    it("shows a finished encode without a redundant percentage", () => {
        encoderState.status.value = "completed";
        encoderState.progress.value = 100;

        const text = mountButton().find('[data-test="encoder-status"]').text();

        // The reported bug: "completed100%" — no space, and the raw status name.
        expect(text).toBe("Encoded");
        expect(text).not.toContain("100%");
        expect(text).not.toContain("completed");
    });

    it("translates the encoder's other statuses out of snake_case", () => {
        encoderState.status.value = "uploading_to_s3";
        encoderState.progress.value = 10;

        expect(mountButton().find('[data-test="encoder-status"]').text()).toBe("Uploading 10%");
    });

    it("shows nothing before a session has started", () => {
        expect(mountButton().find('[data-test="encoder-status"]').exists()).toBe(false);
    });
});

describe("EncodeMediaButton availability", () => {
    it("encodes into the auto-selected bucket when the document has none", async () => {
        await mountButton().find('[data-test="encode-media-button"]').trigger("click");

        expect(encoderState.start).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: "post-1", mediaBucketId: "bucket-1" }),
        );
    });

    it("records the auto-selected bucket on the document", async () => {
        const wrapper = mountButton();

        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        expect(wrapper.emitted("bucketSelected")).toEqual([["bucket-1"]]);
    });

    it("does not re-announce a bucket the document already holds", async () => {
        const wrapper = mountButton({ mediaBucketId: "bucket-1" });

        await wrapper.find('[data-test="encode-media-button"]').trigger("click");

        expect(wrapper.emitted("bucketSelected")).toBeUndefined();
    });

    it("offers a launch link instead of a dead button when the encoder is not running", () => {
        encoderState.availability.value = "unavailable";

        const wrapper = mountButton();

        expect(wrapper.find('[data-test="encoder-launch"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encode-media-button"]').exists()).toBe(false);
    });

    it("explains why it is disabled rather than just being grey", () => {
        const wrapper = mountButton({ documentId: undefined });
        const button = wrapper.find('[data-test="encode-media-button"]');

        expect(button.attributes("disabled")).toBeDefined();
        expect(button.attributes("title")).toContain("Save the document");
    });
});

describe("EncodeMediaButton browser support", () => {
    it("says the browser is the problem rather than offering a link that cannot work", () => {
        encoderState.availability.value = "browser-unsupported";

        const wrapper = mountButton();

        expect(wrapper.find('[data-test="encoder-browser-unsupported"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="encoder-launch"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="encode-media-button"]').exists()).toBe(false);
    });

    it("names the browser that does work", () => {
        encoderState.availability.value = "browser-unsupported";

        const notice = mountButton().find('[data-test="encoder-browser-unsupported"]');

        expect(notice.attributes("title")).toContain("Chrome");
    });
});

describe("EncodeMediaButton resume", () => {
    it("asks whether this document already has an encode running", async () => {
        mountButton();
        await new Promise((resolve) => setTimeout(resolve));

        expect(encoderState.resume).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: "post-1" }),
        );
    });

    it("has nothing to resume for a document that has never been saved", async () => {
        mountButton({ documentId: undefined });
        await new Promise((resolve) => setTimeout(resolve));

        expect(encoderState.resume).not.toHaveBeenCalled();
    });

    it("follows the editor to another document rather than the one it was built for", async () => {
        const wrapper = mountButton();
        await new Promise((resolve) => setTimeout(resolve));
        encoderState.resume.mockClear();

        await wrapper.setProps({ documentId: "post-2" });
        await new Promise((resolve) => setTimeout(resolve));

        expect(encoderState.resume).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: "post-2" }),
        );
    });
});
