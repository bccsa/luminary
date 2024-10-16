import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import NotFoundPage from "./NotFoundPage.vue";

describe("NotFoundPage", () => {
    it("displays the page code error", async () => {
        const wrapper = mount(NotFoundPage, {
            props: {
                errorType: "page",
            },
        });

        expect(wrapper.html()).toContain("404");
    });

    it("displays the content code error", async () => {
        const wrapper = mount(NotFoundPage, {
            props: {
                errorType: "content",
            },
        });

        expect(wrapper.html()).toContain("204");
    });
});
