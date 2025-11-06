import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { db, DocType, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
} from "./EditContent.test-utils";

describe("EditContent - Delete Operations", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("marks a post/tag document for deletion without marking associated content documents for deletion when the user deletes a post/tag", async () => {
        const wrapper = mount(EditContent, {
            props: {
                id: mockPostDto._id,
                languageCode: "en",
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for translations to load
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        let translationDeleteButton;
        await waitForExpect(async () => {
            translationDeleteButton = wrapper.find('[data-test="translation-delete-button"]');
            expect(translationDeleteButton.exists()).toBe(true);
        });
        await translationDeleteButton!.trigger("click"); // Delete the English translation

        let translationDeleteModalButton;
        await waitForExpect(async () => {
            translationDeleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            expect(translationDeleteModalButton.exists()).toBe(true);
        });
        await translationDeleteModalButton!.trigger("click"); // Accept dialog

        let postDeleteButton;
        await waitForExpect(async () => {
            postDeleteButton = wrapper.find('[data-test="delete-button"]');
            expect(postDeleteButton.exists()).toBe(true);
        });
        await postDeleteButton!.trigger("click"); // Delete the post

        let postDeleteModalButton;
        await waitForExpect(async () => {
            postDeleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            expect(postDeleteModalButton.exists()).toBe(true);
        });
        await postDeleteModalButton!.trigger("click"); // Accept dialog

        await waitForExpect(async () => {
            const res = await db.localChanges.where({ docId: mockPostDto._id }).toArray();

            // Only the post/tag document should be marked for deletion
            expect(res.length).toBe(1);
            expect(res[0].doc).toMatchObject({
                _id: mockPostDto._id,
                deleteReq: 1,
            });
        });
    });

    it("marks a content document for deletion when the user deletes a content document", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for translations to load
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        let translationDeleteButton;
        await waitForExpect(async () => {
            translationDeleteButton = wrapper.find('[data-test="translation-delete-button"]');
            expect(translationDeleteButton.exists()).toBe(true);
        });
        await translationDeleteButton!.trigger("click"); // Delete the English translation

        let translationDeleteModalButton;
        await waitForExpect(async () => {
            translationDeleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            expect(translationDeleteModalButton.exists()).toBe(true);
        });
        await translationDeleteModalButton!.trigger("click"); // Accept dialog

        // Save the changes
        let saveButton;
        await waitForExpect(async () => {
            saveButton = wrapper.find('[data-test="save-button"]');
            expect(saveButton.exists()).toBe(true);
        });
        await saveButton!.trigger("click");

        await waitForExpect(async () => {
            const res = await db.localChanges.where({ docId: mockEnglishContentDto._id }).toArray();

            // The content document should be marked for deletion
            expect(res.length).toBe(1);
            expect(res[0].doc).toMatchObject({
                _id: mockEnglishContentDto._id,
                deleteReq: 1,
            });
        });
    });
});
