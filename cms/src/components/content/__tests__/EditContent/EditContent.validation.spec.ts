import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { db, DocType, type ContentDto, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
} from "./EditContent.test-utils";

describe("EditContent - Validation & Error Handling", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("doesn't save when the content is invalid", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        // Simulate enabling dirty state
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("");

        // Click the save button
        wrapper.find('[data-test="save-button"]').trigger("click");

        // Check that the saved version hasn't changed and that an error notification was shown
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.title).toBe(mockEnglishContentDto.title);
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: "error",
                }),
            );
        });
    });

    it("routes back to overview if parent is not found in the database", async () => {
        const notificationStore = useNotificationStore();
        mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: { ...mockPostDto, _id: "post-post5" }._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: "Parent not found",
                    description: "The parent document was not found in the database",
                }),
            );
        });
    });
});
