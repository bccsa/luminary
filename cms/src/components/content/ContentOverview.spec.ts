import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "@/components/content/ContentOverview.vue";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { DocType } from "@/types";
import { ref } from "vue";
import { DateTime } from "luxon";

describe("ContentOverview.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                whereTypeAsRef: vi.fn((docType) => {
                    if (docType === "post") {
                        return ref([mockPostDto]);
                    } else if (docType === "language") {
                        return ref([mockLanguageDtoEng]);
                    }

                    return ref([]);
                }),
                whereParentAsRef: vi.fn(() => {
                    return ref([mockEnglishContentDto]);
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

    // it("should display content", async () => {
    //     const wrapper = mount(ContentOverview, {
    //         global: {
    //             mocks: {
    //                 $db: {
    //                     docs: {
    //                         get: vi.fn().mockResolvedValueOnce({
    //                             id: "1",
    //                             entityName: "post",
    //                             title: "Title",
    //                             content: "Content",
    //                         }),
    //                         getAsRef: vi.fn(),
    //                     },
    //                 },
    //             },
    //             plugins: [createTestingPinia()],
    //         },
    //     });
    //     await wrapper.vm.$nextTick();
    //     expect(wrapper.findAll(".content-overview-content-item").length).toBe(1);
    // });
    it("should display content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });

        console.log(wrapper.html());
        expect(wrapper.html().includes(mockEnglishContentDto.title)).toBeTruthy();
    });
});
