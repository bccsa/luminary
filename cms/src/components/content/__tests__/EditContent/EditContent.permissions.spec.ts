import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { db, DocType, accessMap, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import EditContentBasic from "../../EditContentBasic.vue";
import EditContentParent from "../../EditContentParent.vue";
import EditContentVideo from "../../EditContentVideo.vue";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    wait,
    mockPostDto,
    translateAccessToAllContentMap,
} from "./EditContent.test-utils";

describe("EditContent - Permissions & Access Control", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("enables content editing when the user has translate access to the content but does not have edit access", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            await wait(100); // The disabled prop is not updated immediately, so when testing for false, we need to wait a bit
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(false);
        });
    });

    it("disables content editing when the user does not have translate access to the content", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: false,
            edit: true,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables content editing when the user does not have publish access to the content", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: false,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // mockEnglishContentDto has its publish status set to true
        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables content editing when the user does not have translate access to the selected language", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: true,
        };
        accessMap.value["group-languages"].language = {
            view: true,
            translate: false,
            edit: false,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables post/tag settings editing when the user does not have edit access post/tag", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("enables post/tag settings editing when no groups are set", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, memberOf: [] }]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(false);
        });
    });

    it("enables content editing when no groups are set", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, memberOf: [] }]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(false);
            expect(wrapper.findComponent(EditContentVideo).props().disabled).toBe(false);
        });
    });

    it("disables post/tag settings editing when the user does not have access to one of the groups", async () => {
        await db.docs.bulkPut([
            { ...mockPostDto, memberOf: ["group-public-content", "group-with-no-access"] },
        ]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("check if the user does not have delete access", async () => {
        delete accessMap.value["group-public-content"].post?.delete;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            const deletebutton = wrapper.find('[data-test="delete-button"]');
            expect(deletebutton.exists()).toBe(false);
        });
    });
});
