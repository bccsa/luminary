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
import EditContent from "./EditContent.vue";
import { DocType } from "@/types";

describe("EditContent.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                get: vi.fn(async (postId) => {
                    return { _id: postId };
                }),
                whereParent: vi.fn(async (parentId, parentType) => {
                    return [{ ...mockEnglishContentDto, parentType, parentId }];
                }),
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
                uuid: vi.fn(() => "new-uuid"),
                upsert: vi.fn(),
            },
        }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("save the content", async () => {
        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                routerBackLink: "posts.index",
                backLinkText: "Posts",
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to fetch data
        await wrapper.vm.$nextTick();

        // Trigger save event
        const saveButton = wrapper.find('[data-test="draft"]');
        expect(saveButton.exists()).toBe(true);

        // // Simulate enabling dirty state
        // console.log(wrapper.setProps({ parentId: "new-uuid" }));

        // wrapper.setProps({ languageCode: "fra" });
        // await wrapper.vm.$nextTick();

        // expect(saveButton.attributes().disabled).toBe("");

        // console.log(wrapper.html());
    });
});
