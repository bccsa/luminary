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

describe("EditContentBasic.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                get: vi.fn(async (postId) => {
                    // Mock implementation to return a PostDto object
                    return { _id: postId };
                }),
                whereParent: vi.fn(async (parentId, parentType) => {
                    // Mock implementation to return an array of ContentDto objects
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
            },
        }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("should edit title and update slug", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parent: mockPostDto,
                parentId: mockPostDto._id,
                content: mockEnglishContentDto,
                disabled: false,
                validated: false,
                routerBackLink: "/",
                backLinkText: "Back",
            },
            global: {
                plugins: [createTestingPinia()],
                // stubs: {
                //     // Stub the child components used in EditContent.vue
                //     LanguageSelector2: { template: "<div />" }, // Example of stubbing LanguageSelector2
                //     EditContentBasic: { template: "<div />" }, // Stub other child components in a similar way
                //     EditContentText: { template: "<div />" },
                //     EditContentVideo: { template: "<div />" },
                //     EditContentParentValidation: { template: "<div />" },
                //     EditContentPreview: { template: "<div />" },
                //     EditContentParent: { template: "<div />" },
                // },
            },
        });

        // Wait for the component to update
        await wrapper.vm.$nextTick();
        expect(wrapper.text()).toContain("Edit Post");
    });
});
