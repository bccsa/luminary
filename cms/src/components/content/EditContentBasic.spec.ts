import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { ref } from "vue";
import { DateTime } from "luxon";
import LanguageSelector2 from "./LanguageSelector2.vue";
import EditContentBasic from "./EditContentBasic.vue";

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                whereTypeAsRef: vi.fn((docType) => {
                    if (docType === "post") {
                        return ref([mockPostDto]);
                    } else if (docType === "language") {
                        return ref([mockLanguageDtoEng, mockLanguageDtoFra]);
                    } else if (docType === "content") {
                        return ref([mockEnglishContentDto, mockFrenchContentDto]);
                    }

                    return ref([]);
                }),
                whereParentAsRef: vi.fn(() => {
                    return ref([mockEnglishContentDto, mockFrenchContentDto]);
                }),
                isLocalChange: vi.fn(() => {
                    return false;
                }),
                toDateTime: vi.fn((val) => {
                    return DateTime.fromMillis(val);
                }),
            },
        }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("edit title", async () => {
        const wrapper = mount(EditContentBasic, {
            props: {
                disabled: false,
                validated: false,
                content: mockEnglishContentDto,
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to update
        await wrapper.vm.$nextTick();

        // Find and update the title input field
        const titleInput = wrapper.find('[name="title"]');
        await titleInput.setValue("Updated Title");

        // Check if the content's title was updated
        expect(wrapper.props().content?.title).toBe("Updated Title");

        // // Check if the slug is updated correctly
        // await wrapper.vm.$nextTick();
        // const slugSpan = wrapper.find('[data-test="slugSpan"]');

        // await wrapper.vm.$nextTick();
        // expect(slugSpan.text()).toBe("updated-title");

        // Check if the save event is emitted
        expect(wrapper.emitted().save).toBeTruthy();
    });
});
