import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RichTextEditor from "./RichTextEditor.vue";
import waitForExpect from "wait-for-expect";

describe("RichTextEditor", () => {
    it("mounts with no content", async () => {
        const wrapper = mount(RichTextEditor);

        expect(wrapper.exists()).toBe(true);
    });

    it("mounts with content", async () => {
        const wrapper = mount(RichTextEditor, {
            props: {
                modelValue: "<p>Gandalf the Grey</p>",
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Gandalf the Grey");
        });
    });
});
