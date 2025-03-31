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
import LCombobox from "./LCombobox.vue";
import waitForExpect from "wait-for-expect";
import LInput from "./LInput.vue";
import LTag from "../common/LTagHandler/LTag.vue";
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
        const selected = ref([]);
        const wrapper = mount(LCombobox, {
            props: {
                options: [{ id: 0, label: "Test Label", value: "test-value" }],
                selectedOptions: selected.value,
                docType: DocType.Post,
            },
        });

        await wrapper.findComponent(LInput).setValue("Test Label");
        await wrapper.findComponent(LInput).trigger("change");

        await wrapper.find('[name="options-open-btn"]').trigger("click");

        await wrapper.find("[name='list-item']").trigger("click");

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
});
