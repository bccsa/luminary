import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { db, DocType, type ContentDto, accessMap, PostType, PublishStatus } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContent from "./EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import EditContentBasic from "./EditContentBasic.vue";
import EditContentParent from "./EditContentParent.vue";
import LTextToggle from "../forms/LTextToggle.vue";
import LanguageSelector from "./LanguageSelector.vue";
import { initLanguage } from "@/globalConfig";
import RichTextEditor from "../editor/RichTextEditor.vue";
import EditContentText from "./EditContentText.vue";
import LoadingBar from "../LoadingBar.vue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});
vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            currentRoute: {
                value: {
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

describe("EditContent.vue", () => {
    beforeEach(async () => {
        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());
        await db.docs.clear();
        await db.localChanges.clear();

        // seed the fake indexDB with mock data
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([
            mockData.mockEnglishContentDto,
            mockData.mockFrenchContentDto,
            mockData.mockSwahiliContentDto,
        ]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        accessMap.value = { ...mockData.superAdminAccessMap };
        initLanguage();
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
        vi.clearAllMocks();
    });

    it("can load content from the database", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });
        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("reverts changes to the original content", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            const titleInput = wrapper.find('input[name="title"]');
            expect((titleInput.element as HTMLTextAreaElement).value).toBe(
                mockData.mockEnglishContentDto.title,
            );
        });

        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("New Title");

        const revertButton = wrapper.find('[data-test="revert-changes-button"]');
        expect(revertButton.exists()).toBe(true);
        await revertButton.trigger("click");

        await waitForExpect(() => {
            expect((titleInput.element as HTMLTextAreaElement).value).toBe(
                mockData.mockEnglishContentDto.title,
            );
        });
    });

    it("can save content to the database", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
        await titleInput.setValue("New Title");

        // Click the save button
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        // Wait for the save to complete
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockData.mockEnglishContentDto._id);
            expect(savedDoc.title).toBe("New Title");
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: "success",
                }),
            );
        });
    });

    it("doesn't save when the content is invalid", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
            const savedDoc = await db.get<ContentDto>(mockData.mockEnglishContentDto._id);
            expect(savedDoc.title).toBe(mockData.mockEnglishContentDto.title);
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: "error",
                }),
            );
        });
    });

    it("only displays languages the user has Translate access to in languageSelector", async () => {
        await db.docs.clear();
        await db.docs.bulkPut([mockData.mockPostDto, mockData.mockEnglishContentDto]);

        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].language = {
            view: true,
            translate: false,
            edit: true,
            publish: true,
        };

        await db.docs.bulkPut([
            { ...mockData.mockLanguageDtoFra, memberOf: ["group-public-content"] },
            { ...mockData.mockLanguageDtoSwa, memberOf: ["group-public-content"] },
            { ...mockData.mockLanguageDtoEng, memberOf: ["group-languages"] },
        ]);

        const wrapper = mount(EditContent, {
            props: {
                id: "test-id-123",
                languageCode: "en",
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
            slots: {},
        });

        const languageSelector = wrapper.findComponent(LanguageSelector);
        const languages = languageSelector.find("[data-test='languagePopup']");

        // Wait for the popup to be rendered and languages to load
        await waitForExpect(() => {
            expect(languages.exists()).toBe(true);
            // Ensure the language list is populated (e.g., check for at least one language)
            expect(languages.text()).toContain("English"); // Or any expected language
        });

        // Now check the specific assertions
        await waitForExpect(() => {
            expect(languages.html()).toContain("English");
            expect(languages.html()).not.toContain("Français");
            expect(languages.html()).not.toContain("Swahili");
        });
    });

    it("renders an initial loading state", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                tagOrPostType: PostType.Blog,
            },
        });

        expect(wrapper.findComponent(LoadingBar).exists()).toBe(true);
    });

    it("renders an empty state when no language is selected", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Please select a language to start editing");
        });
    });

    it("renders all the components", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        expect(wrapper.findComponent(LanguageSelector).exists()).toBe(true); // LanguageSelector is rendered

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true); // EditContentBasic is rendered
            expect(wrapper.html()).toContain("Video"); // EditContentVideo is rendered
            expect(wrapper.find('button[data-test="save-button"]').exists()).toBe(true); // EditContentParentValidation is rendered
        });
    });

    it("renders the title of the default language", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("can set the language from the route / prop params", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "fra",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockData.mockFrenchContentDto.title);
        });
    });

    it("can detect a local change", async () => {
        await db.localChanges.put(mockData.mockLocalChange1);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Offline changes");
        });
    });

    it("enables content editing when the user has translate access to the content but does not have edit access", async () => {
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: false,
            edit: true,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables content editing when the user does not have publish access to the content", async () => {
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: false,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
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
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
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
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables post/tag settings editing when the user does not have edit access post/tag", async () => {
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("enables post/tag settings editing when no groups are set", async () => {
        await db.docs.bulkPut([{ ...mockData.mockPostDto, memberOf: [] }]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(false);
        });
    });

    it("disables post/tag settings editing when the user does not have access to one of the groups", async () => {
        await db.docs.bulkPut([
            { ...mockData.mockPostDto, memberOf: ["group-public-content", "group-with-no-access"] },
        ]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("should save changes in draft mode with translate access on language and post/tag, without needing publish access", async () => {
        accessMap.value = { ...mockData.translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: false,
        };
        accessMap.value["group-languages"].language = {
            view: true,
            translate: true,
            edit: false,
        };

        // Set content status to Draft (not Published)
        await db.docs.put({
            ...mockData.mockEnglishContentDto,
            status: PublishStatus.Draft,
        } as ContentDto);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for data load
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        // Check that the publish button is disabled
        const publishButton = wrapper.findAllComponents(LTextToggle)[1];
        expect(publishButton.exists()).toBe(true);
        expect(publishButton.props().disabled).toBe(true);

        // Update title to make the content dirty
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("Translated Title");

        // Save
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        // Check if content is saved
        await waitForExpect(async () => {
            const saved = await db.get<ContentDto>(mockData.mockEnglishContentDto._id);
            expect(saved?.title).toBe("Translated Title");
        });
    });

    it("correctly creates a duplicate of a document and all its translations", async () => {
        const notificationStore = useNotificationStore();
        const mockNotification = vi.spyOn(notificationStore, "addNotification");

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-btn']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            // Duplicate button click is not triggered outside the waitForExpect()
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });

        await confirmBtn!.trigger("click");

        await waitForExpect(() => {
            expect(mockNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: "Successfully duplicated",
                }),
            );
        });

        //@ts-expect-error
        const newParentId = wrapper.vm.editableParent._id;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        await wrapper.setProps({ id: newParentId });

        await wrapper.find("[data-test='save-button']").trigger("click");

        await waitForExpect(async () => {
            const res = await db.localChanges.where({ docId: wrapper.vm.$props.id }).toArray();
            expect(res.length).toBeGreaterThan(0);
        });
    });

    it("correctly updates text field in indexedDB from rich text editor", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        const editContentBasic = wrapper.findComponent(EditContentText);
        const richTextEditor = editContentBasic.findComponent(RichTextEditor);
        expect(richTextEditor.exists()).toBe(true);

        const authorInput = wrapper.find('input[name="author"]');
        expect(authorInput.exists()).toBe(true);
        await authorInput.setValue("New Author");

        //@ts-ignore -- valid code
        await richTextEditor.vm.editor.commands.setContent("<p>New Content</p>");

        // Trigger the update event to save the content
        //@ts-ignore -- valid code
        const updatedContent = richTextEditor.vm.editor.getJSON();
        //@ts-ignore -- valid code
        richTextEditor.vm.text = JSON.stringify(updatedContent);

        await waitForExpect(() => {
            expect(richTextEditor.vm.text).toContain("New Content");
            expect(wrapper.html()).toContain("New Content");
        });

        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        await waitForExpect(async () => {
            const res = await db.localChanges.toArray();

            expect(res.length).toBe(2);
            expect(JSON.parse((res[1].doc as any).text).content[0].content[0].text).toBe(
                "New Content",
            );
        });
    });

    it("should generate a redirect if a slug has been changed", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            // Edit the slug to trigger a redirect creation
            const editContentBasic = wrapper.findComponent(EditContentBasic);
            const toogle = editContentBasic.findAllComponents(LTextToggle)[0];
            const visible = toogle.find('[data-test="text-toggle-left-value"]');
            expect(visible.exists()).toBe(true);

            expect(wrapper.find('[data-test="slugSpan"]').exists()).toBe(true);
            await wrapper.find('[data-test="slugSpan"]').trigger("click");
            await wrapper.find('[name="slug"]').setValue("new-slug");
            await wrapper.find('[name="slug"]').trigger("change");
        });

        await waitForExpect(async () => {
            await wrapper.find('[data-test="save-button"]').trigger("click");
        });

        await waitForExpect(async () => {
            const res = await db.localChanges.toArray();
            expect(res.length).toBeGreaterThan(0);

            // Check if a redirect was created with the new slug.
            expect(res.length).toBe(3);
            const redirect = res.filter((o) => o.doc?.type === DocType.Redirect);
            expect(redirect.length).toBe(1);
            expect((redirect[0].doc as any).slug).toBe("post1-eng");
            expect((redirect[0].doc as any).toSlug).toBe("new-slug");
        });
    });

    describe("delete requests", () => {
        it("marks a post/tag document for deletion without marking associated content documents for deletion when the user deletes a post/tag", async () => {
            const wrapper = mount(EditContent, {
                props: {
                    id: mockData.mockPostDto._id,
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
                const res = await db.localChanges
                    .where({ docId: mockData.mockPostDto._id })
                    .toArray();

                // Only the post/tag document should be marked for deletion
                expect(res.length).toBe(1);
                expect(res[0].doc).toMatchObject({
                    _id: mockData.mockPostDto._id,
                    deleteReq: 1,
                });
            });
        });

        it("marks a content document for deletion when the user deletes a content document", async () => {
            const wrapper = mount(EditContent, {
                props: {
                    docType: DocType.Post,
                    id: mockData.mockPostDto._id,
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
                const res = await db.localChanges
                    .where({ docId: mockData.mockEnglishContentDto._id })
                    .toArray();

                // The content document should be marked for deletion
                expect(res.length).toBe(1);
                expect(res[0].doc).toMatchObject({
                    _id: mockData.mockEnglishContentDto._id,
                    deleteReq: 1,
                });
            });
        });

        it("Check if the user does not have delete access", async () => {
            delete accessMap.value["group-public-content"].post?.delete;

            const wrapper = mount(EditContent, {
                props: {
                    docType: DocType.Post,
                    id: mockData.mockPostDto._id,
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
});
