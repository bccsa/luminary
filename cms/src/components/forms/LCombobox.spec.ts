import "fake-indexeddb/auto";
import {
    mockGroupDtoPrivateContent,
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { accessMap, db, DocType } from "luminary-shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LCombobox, { type ComboboxOption } from "./LCombobox.vue";
import waitForExpect from "wait-for-expect";
import LTag from "../content/LTag.vue";
import { ref } from "vue";

describe("LCombobox", () => {
    accessMap.value = superAdminAccessMap;

    beforeAll(async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoPrivateContent,
        ]);
    });

    afterEach(async () => {
        vi.clearAllMocks();
    });

    afterAll(async () => {
        await db.docs.clear();
    });

    it("displays selected options", async () => {
        // Selected option labels are controlled externally, so we only need to pass the selected values
        const options = ref([]);
        const selectedLabels = ref([
            { id: 0, label: "Test Label", value: "test-value" } as ComboboxOption,
        ]);

        const wrapper = mount(LCombobox, {
            props: {
                options: selectedLabels.value,
                selectedOptions: options.value, // used to inform the parent of the selected options, but not used to display the labels directly, so we can pass an empty array
                selectedLabels: selectedLabels.value,
            },
        });

        const lTag = wrapper.findComponent(LTag);

        await waitForExpect(() => {
            expect(lTag.html()).toContain("Test Label");
        });
    });

    it("displays all available options", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                options: [{ id: 0, label: "Test Label", value: "test-value" }],
                docType: DocType.Post,
                selectedOptions: [],
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Test Label");
        });
    });

    it("renders a tag as disabled when isRemovable is false", async () => {
        const selected = ref(["id-1"]);

        const wrapper = mount(LCombobox, {
            props: {
                options: [{ id: "id-1", label: "Unremovable", value: "id-1" }],
                selectedOptions: selected.value,
                selectedLabels: [
                    {
                        id: "id-1",
                        label: "Unremovable",
                        value: "id-1",
                        isRemovable: false,
                    },
                ],
            },
        });

        const tag = wrapper.findComponent(LTag);
        expect(tag.props("disabled")).toBe(true);
    });

    it("removes tag on click when removable", async () => {
        const selected = ref(["id-1"]);

        const wrapper = mount(LCombobox, {
            props: {
                options: [{ id: "id-1", label: "Removable", value: "id-1" }],
                selectedOptions: selected.value,
                "onUpdate:selectedOptions": (e: any) => (selected.value = e),
                selectedLabels: [
                    {
                        id: "id-1",
                        label: "Removable",
                        value: "id-1",
                        isRemovable: true,
                    },
                ],
            },
        });

        await wrapper.findComponent(LTag).find("button").trigger("click");

        await waitForExpect(() => {
            expect(selected.value).not.toContain("id-1");
        });
    });

    it("renders fallback label when group is not viewable", () => {
        const wrapper = mount(LCombobox, {
            props: {
                options: [],
                selectedOptions: ["hidden-uuid"],
                selectedLabels: [
                    {
                        id: "hidden-uuid",
                        label: "hidden-uuid",
                        value: "hidden-uuid",
                        isVisible: false,
                        isRemovable: false,
                    },
                ],
            },
        });

        expect(wrapper.text()).toContain("hidden-uuid");
    });

    it("adds an option to the selected options when clicked", async () => {
        const selected = ref(["id-1"]);
        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: selected.value,
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        await wrapper.findAll("[name='list-item']")[2].trigger("click");

        await waitForExpect(() => {
            expect(selected.value).toContain("test-3");
        });
    });

    it("adds an option to the selected options when enter is pressed", async () => {
        const selected = ref(["id-1"]);
        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: selected.value,
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        const searchElement = wrapper.find("[name='option-search']");
        searchElement.setValue("Test Label 3");
        await searchElement.trigger("keydown.enter");

        await waitForExpect(() => {
            expect(selected.value).toContain(2);
        });
    });

    it("closes the dropdown when escape is pressed", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: [],
            },
        });
        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        const searchElement = wrapper.find("[name='option-search']");

        const options = wrapper.find("[data-test='options']");

        await waitForExpect(() => {
            expect(options.exists()).toBe(true);
        });
        await searchElement.trigger("keydown.escape");

        await wrapper.vm.$nextTick();

        await waitForExpect(async () => {
            expect(wrapper.find("[data-test='options']").exists()).toBe(false);
        });
    });

    it("highlights correctly when navigating with down arrow key", async () => {
        // Mock scrollIntoView to prevent errors
        Element.prototype.scrollIntoView = vi.fn();

        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: [],
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        const searchElement = wrapper.find("[name='option-search']");

        await searchElement.trigger("keydown.down");

        await waitForExpect(() => {
            expect(wrapper.findAll("[name='list-item']")[0].classes()).toContain("bg-zinc-100");
        });
    });

    it("highlights correctly when navigating with up arrow key", async () => {
        // Mock scrollIntoView to prevent errors
        Element.prototype.scrollIntoView = vi.fn();

        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: [],
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        const searchElement = wrapper.find("[name='option-search']");

        await searchElement.trigger("keydown.down");

        await searchElement.trigger("keydown.down");

        await waitForExpect(() => {
            expect(wrapper.findAll("[name='list-item']")[1].classes()).toContain("bg-zinc-100");
        });

        await searchElement.trigger("keydown.up");

        await waitForExpect(() => {
            expect(wrapper.findAll("[name='list-item']")[0].classes()).toContain("bg-zinc-100");
            expect(wrapper.findAll("[name='list-item']")[1].classes()).not.toContain("bg-zinc-100");
        });
    });

    it("doesn't show the input search when the slot actions is set", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: [],
            },
            slots: {
                actions: "<button>Action</button>",
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.find("[name='option-search']").exists()).toBe(false);
        });
    });

    it("show the input search when the slot actions is not set", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                options: [
                    { id: 0, label: "Test Label 1", value: "test-1" },
                    { id: 1, label: "Test Label 2", value: "test-2" },
                    { id: 2, label: "Test Label 3", value: "test-3" },
                ],
                docType: DocType.Post,
                selectedOptions: [],
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find("[name='option-search']").exists()).toBe(true);
        });
    });
});
