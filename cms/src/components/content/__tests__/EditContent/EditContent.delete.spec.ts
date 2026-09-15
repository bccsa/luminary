import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";

// Set up mocks before any imports
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: {
                    name: "edit",
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

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

        let chevronIcon;
        await waitForExpect(async () => {
            chevronIcon = wrapper.find('[data-test="dropdown-trigger"]');
            expect(chevronIcon.exists()).toBe(true);
        });
        await chevronIcon!.trigger("click"); // Open the dropdown

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

    describe("deleting the media files with the document", () => {
        /** Open the post's delete dialog: dropdown → delete → dialog. */
        const openDeleteDialog = async (wrapper: any) => {
            let chevron: any;
            await waitForExpect(() => {
                chevron = wrapper.find('[data-test="dropdown-trigger"]');
                expect(chevron.exists()).toBe(true);
            });
            await chevron!.trigger("click");

            let deleteButton: any;
            await waitForExpect(() => {
                deleteButton = wrapper.find('[data-test="delete-button"]');
                expect(deleteButton.exists()).toBe(true);
            });
            await deleteButton!.trigger("click");
        };

        const confirm = async (wrapper: any) => {
            let primary: any;
            await waitForExpect(() => {
                primary = wrapper.find('[data-test="modal-primary-button"]');
                expect(primary.exists()).toBe(true);
            });
            await primary!.trigger("click");
        };

        const queuedDelete = async () => {
            const changes = await db.localChanges.where({ docId: mockPostDto._id }).toArray();
            return changes.find((c: any) => c.doc?.deleteReq)?.doc as any;
        };

        it("offers the option, unticked, for a document with media", async () => {
            const wrapper = mount(EditContent, {
                props: {
                    id: mockPostDto._id,
                    languageCode: "eng",
                    docType: DocType.Post,
                    tagOrPostType: PostType.Blog,
                },
            });

            await openDeleteDialog(wrapper);

            await waitForExpect(() => {
                const option = wrapper.find('[data-test="delete-media-files"]');
                expect(option.exists()).toBe(true);
                // Irreversible, so never pre-ticked.
                expect((option.find("input").element as HTMLInputElement).checked).toBe(false);
            });
        });

        it("does not ask the API to touch storage when the option is left alone", async () => {
            const wrapper = mount(EditContent, {
                props: {
                    id: mockPostDto._id,
                    languageCode: "eng",
                    docType: DocType.Post,
                    tagOrPostType: PostType.Blog,
                },
            });

            await openDeleteDialog(wrapper);
            await confirm(wrapper);

            await waitForExpect(async () => {
                const doc = await queuedDelete();
                expect(doc).toBeTruthy();
                expect(doc.media?.deleteFiles).toBeFalsy();
            });
        });

        it("asks the API to delete the files when the option is ticked", async () => {
            const wrapper = mount(EditContent, {
                props: {
                    id: mockPostDto._id,
                    languageCode: "eng",
                    docType: DocType.Post,
                    tagOrPostType: PostType.Blog,
                },
            });

            await openDeleteDialog(wrapper);

            let option: any;
            await waitForExpect(() => {
                option = wrapper.find('[data-test="delete-media-files"]');
                expect(option.exists()).toBe(true);
            });
            await option!.find("input").setValue(true);

            await confirm(wrapper);

            await waitForExpect(async () => {
                const doc = await queuedDelete();
                expect(doc).toBeTruthy();
                expect(doc.media.deleteFiles).toBe(true);
            });
        });
    });
});
