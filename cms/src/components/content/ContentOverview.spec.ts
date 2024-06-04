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

describe("ContentOverview.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                whereTypeAsRef: vi.fn((docType) => {
                    console.log("we made it yes!");
                    if (docType === "post") {
                        return ref([mockPostDto]);
                    } else if (docType === "language") {
                        return ref([mockLanguageDtoEng]);
                    }

                    return ref([]);
                }),
                whereParentAsRef: vi.fn(() => {
                    console.log("we made it!");
                    return ref([mockEnglishContentDto]);
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
        await wrapper.vm.$nextTick();
        expect(wrapper.findAll(".content-overview-content-item").length).toBe(1);
    });
});
