import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import EmptyState from "./EmptyState.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("EmptyState", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the title and description", async () => {
        const wrapper = mount(EmptyState, {
            props: {
                title: "Empty state title",
                description: "Empty state description",
            },
        });

        expect(wrapper.html()).toContain("Empty state title");
        expect(wrapper.html()).toContain("Empty state description");
    });

    it("renders a default and custom icon", async () => {
        const wrapper = mount(EmptyState, {
            props: {
                title: "Empty state title",
                description: "Empty state description",
            },
        });

        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(true);

        await wrapper.setProps({
            icon: "test-icon",
        });

        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(false);
        expect(wrapper.find("test-icon").exists()).toBe(true);
    });

    it("renders a button when given", async () => {
        const wrapper = mount(EmptyState, {
            props: {
                title: "Empty state title",
                description: "Empty state description",
            },
        });

        expect(wrapper.find("button").exists()).toBe(false);

        const buttonAction = vi.fn();
        await wrapper.setProps({
            buttonText: "Button text",
            buttonAction,
        });
        await wrapper.find("button").trigger("click");

        expect(wrapper.find("button").exists()).toBe(true);
        expect(wrapper.html()).toContain("Button text");
        expect(buttonAction).toHaveBeenCalled();
    });

    it("doesn't render the button when the permission for it is false", async () => {
        const wrapper = mount(EmptyState, {
            props: {
                title: "Empty state title",
                description: "Empty state description",
                buttonText: "Button text",
                buttonAction: vi.fn(),
                buttonPermission: false,
            },
        });

        expect(wrapper.find("button").exists()).toBe(false);
    });

    it("renders the default slot", async () => {
        const wrapper = mount(EmptyState, {
            props: {
                title: "Empty state title",
                description: "Empty state description",
            },
            slots: {
                default: "Test slot",
            },
        });

        expect(wrapper.html()).toContain("Test slot");
    });
});
