import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { db, DocType, type ContentDto, isConnected, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import LanguageSelector from "../../LanguageSelector.vue";
import LoadingBar from "../../../LoadingBar.vue";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
} from "./EditContent.test-utils";

describe("EditContent - Basic Operations", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("can load content from the database", async () => {
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
            expect(wrapper.html()).toContain(mockEnglishContentDto.title);
        });
    });

    it("reverts changes to the original content", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            const titleInput = wrapper.find('input[name="title"]');
            expect((titleInput.element as HTMLTextAreaElement).value).toBe(
                mockEnglishContentDto.title,
            );
        });

        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("New Title");

        const revertButton = wrapper.find('[data-test="revert-changes-button"]');
        expect(revertButton.exists()).toBe(true);
        await revertButton.trigger("click");

        await waitForExpect(() => {
            expect((titleInput.element as HTMLTextAreaElement).value).toBe(
                mockEnglishContentDto.title,
            );
        });
    });

    it("doesn't show view live button if not connected", async () => {
        isConnected.value = false;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find('[name="view-live"]').exists()).toBe(false);
        });
    });

    it("can save content to the database", async () => {
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
        await titleInput.setValue("New Title");

        // Click the save button
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        // Wait for the save to complete
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.title).toBe("New Title");
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: "success",
                }),
            );
        });
    });

    it("renders an initial loading state", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                tagOrPostType: PostType.Blog,
            },
        });

        expect(wrapper.findComponent(LoadingBar).exists()).toBe(true);
    });

    it("renders an empty state when no language is selected", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
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
                id: mockPostDto._id,
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
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockEnglishContentDto.title);
        });
    });

    it("can set the language from the route / prop params", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "fra",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockFrenchContentDto.title);
        });
    });

    it("can detect a local change", async () => {
        const { mockLocalChange1 } = await import("@/tests/mockdata");
        await db.localChanges.put(mockLocalChange1);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Offline changes");
        });
    });
});
