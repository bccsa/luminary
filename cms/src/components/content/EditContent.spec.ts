import "fake-indexeddb/auto";
import { describe, it, beforeAll, afterAll, afterEach, beforeEach, expect } from "vitest";
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
import { DocType, type ContentDto } from "@/types";
import { db } from "@/db/baseDatabase";

describe("EditContent.vue", () => {
    beforeAll(async () => {
        // vi.mock("@/db/baseDatabase", () => ({
        //     db: {
        //         get: vi.fn(async (postId) => {
        //             return new Promise((resolve) => {
        //                 setTimeout(() => {
        //                     resolve({ ...mockPostDto, _id: postId });
        //                 }, 50);
        //             });
        //         }),
        //         whereParent: vi.fn(async (parentId, parentType) => {
        //             return new Promise((resolve) => {
        //                 setTimeout(() => {
        //                     resolve([{ ...mockEnglishContentDto, parentType, parentId }]);
        //                 }, 50);
        //             });
        //         }),
        //         whereTypeAsRef: vi.fn((docType) => {
        //             if (docType === "post") {
        //                 return ref([mockPostDto]);
        //             } else if (docType === "language") {
        //                 return ref([mockLanguageDtoEng, mockLanguageDtoFra]);
        //             } else if (docType === "content") {
        //                 return ref([mockEnglishContentDto, mockFrenchContentDto]);
        //             }

        //             return ref([]);
        //         }),
        //         whereParentAsRef: vi.fn(() => {
        //             return ref([mockEnglishContentDto, mockFrenchContentDto]);
        //         }),
        //         isLocalChange: vi.fn(() => {
        //             return false;
        //         }),
        //         toDateTime: vi.fn((val) => {
        //             return DateTime.fromMillis(val);
        //         }),
        //         uuid: vi.fn(() => "new-uuid"),
        //         upsert: vi.fn(),
        //     },
        // }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockPostDto]);
        await db.docs.bulkPut([mockEnglishContentDto, mockFrenchContentDto]);
        await db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra]);
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
    });

    afterAll(async () => {
        // vi.clearAllMocks();
    });

    it("save the content", async () => {
        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                parentId: mockPostDto._id,
                languageCode: "eng",
            },
            global: {
                plugins: [createTestingPinia()],
            },
        });

        // Wait for the component to fetch data
        // await wrapper.vm.$nextTick();

        const test = () => {
            return new Promise((resolve) => {
                setTimeout(async () => {
                    resolve(true);
                }, 2000);
            });
        };
        await test();
        // const test0 = await db.docs.where({ parentId: mockPostDto._id }).toArray();
        // const test = await db.whereParent<ContentDto[]>(mockPostDto._id, DocType.Post);
        // const test2 = await db.get<ContentDto>(mockEnglishContentDto._id);

        // console.log(wrapper.html());

        // Simulate enabling dirty state
        const titleInput = wrapper.find('input[name="title"]');
        titleInput.setValue("New Title");
        await test();
        console.log(wrapper.html());

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        // console.log(saveButton.attributes());
        expect(saveButton.exists()).toBe(true);
        // expect(saveButton.attributes().disabled).toBeUndefined();
        saveButton.trigger("click");

        // Wait for the save to complete
        // await test();
        // const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
        // console.log(savedDoc);

        // console.log(wrapper.setProps({ parentId: "new-uuid" }));

        // wrapper.setProps({ languageCode: "fra" });
        // await wrapper.vm.$nextTick();

        // expect(saveButton.attributes().disabled).toBe("");

        // console.log(wrapper.html());
    });
});
