import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EncodeMediaButton from "./EncodeMediaButton.vue";

const mountButton = (props = {}) =>
    mount(EncodeMediaButton, {
        props: {
            availability: "available" as const,
            busy: false,
            documentId: "post-1",
            hasBucket: true,
            ...props,
        },
    });

const button = (wrapper: ReturnType<typeof mountButton>) =>
    wrapper.find('[data-test="encode-media-button"]');

describe("EncodeMediaButton", () => {
    it("asks its owner to encode rather than starting one itself", async () => {
        const wrapper = mountButton();

        await button(wrapper).trigger("click");

        expect(wrapper.emitted("encode")).toHaveLength(1);
    });

    it("stays one control in every state, so the header never changes shape", () => {
        for (const availability of ["available", "unavailable", "browser-unsupported"] as const) {
            expect(button(mountButton({ availability })).exists()).toBe(true);
        }
    });
});

/**
 * A control disabled for five different reasons and explaining none of them is a
 * support question every time, so each reason names itself.
 */
describe("EncodeMediaButton disabled reasons", () => {
    const reasonFor = (props: Record<string, unknown>) =>
        button(mountButton(props)).attributes("title");

    it("says the document must be saved first", () => {
        expect(reasonFor({ documentId: undefined })).toContain("Save the document");
    });

    it("says there is no bucket to write to", () => {
        expect(reasonFor({ hasBucket: false })).toContain("storage bucket");
    });

    it("says the encoder is not running", () => {
        expect(reasonFor({ availability: "unavailable" })).toContain("not running");
    });

    it("says the browser cannot reach it", () => {
        expect(reasonFor({ availability: "browser-unsupported" })).toContain("Chrome");
    });

    it("says the editor lacks permission", () => {
        expect(reasonFor({ disabled: true })).toContain("permission");
    });

    it("explains nothing when it is ready to run", () => {
        expect(reasonFor({})).toContain("Encode video");
        expect(button(mountButton()).attributes("disabled")).toBeUndefined();
    });

    it("does not emit while disabled", async () => {
        const wrapper = mountButton({ documentId: undefined });

        await button(wrapper).trigger("click");

        expect(wrapper.emitted("encode")).toBeUndefined();
    });
});

describe("EncodeMediaButton while starting", () => {
    it("is disabled with a reason once a session is being opened", () => {
        const wrapper = mountButton({ busy: true });

        expect(button(wrapper).attributes("disabled")).toBeDefined();
        expect(button(wrapper).attributes("title")).toContain("Starting");
    });
});
