import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import EditContentForm from "./EditContentForm.vue";
import {
    mockCategory,
    mockEnglishCategoryContent,
    mockEnglishContent,
    mockPost,
    mockUnpublishableContent,
    fullAccessToAllContentMap,
    translateAccessToAllContent,
} from "@/tests/mockData";
import waitForExpect from "wait-for-expect";
import { ContentStatus, DocType, type Content } from "@/types";
import { useLocalChangeStore } from "@/stores/localChanges";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import RichTextEditor from "./RichTextEditor.vue";
import { useNotificationStore } from "@/stores/notification";
import { DateTime, Settings } from "luxon";
import { useUserAccessStore } from "@/stores/userAccess";
import TagSelector from "./TagSelector.vue";
import LToggle from "../forms/LToggle.vue";
import LTag from "./LTag.vue";
import { nextTick } from "vue";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
    onBeforeRouteLeave: vi.fn(),
}));

const docsDb = vi.hoisted(() => {
    return {
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => ({ _id: "content-post1-eng" })),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
            localChanges: docsDb,
        },
    };
});

describe("EditContentForm", () => {
    const saveAsDraftButton = "button[data-test='draft']";
    const publishButton = "button[data-test='publish']";

    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterEach(() => {
        vi.clearAllMocks();
        Settings.resetCaches();
    });

    it("can save as draft", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        await wrapper.find(saveAsDraftButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);
            expect(saveEvent).toHaveLength(1);

            expect(saveEvent![0][0].type).toBe(DocType.Content);
            expect(saveEvent![0][0].status).toBe(ContentStatus.Draft);
        });
    });

    it("can publish the post", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        await wrapper.find(publishButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);
            expect(saveEvent).toHaveLength(1);

            expect(saveEvent![0][0].type).toBe(DocType.Content);
            expect(saveEvent![0][0].status).toBe(ContentStatus.Published);
        });
    });

    it("can can edit basic content fields", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        await wrapper.find("input[name='title']").setValue("Updated Title");
        await wrapper.find("input[name='summary']").setValue("Updated Summary");

        await wrapper.find(saveAsDraftButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);

            expect(saveEvent![0][0].type).toBe(DocType.Content);
            expect(saveEvent![0][0].title).toBe("Updated Title");
            expect(saveEvent![0][0].summary).toBe("Updated Summary");
        });
    });

    it("can can edit parent image", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        await wrapper.find("input[name='parent.image']").setValue("updatedImage.jpg");

        await wrapper.find(saveAsDraftButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);

            expect(saveEvent![0][1].type).toBe(DocType.Post);
            expect(saveEvent![0][1].image).toBe("updatedImage.jpg");
        });
    });

    it("does not display text, audio or video when not defined", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: {
                    ...mockEnglishContent,
                    text: undefined,
                },
                docType: DocType.Post,
            },
        });

        const textEditor = await wrapper.findComponent(RichTextEditor);
        const audioInput = await wrapper.find("input[name='audio']");
        const videoInput = await wrapper.find("input[name='video']");
        expect(textEditor.exists()).toBe(false);
        expect(audioInput.isVisible()).toBe(false);
        expect(videoInput.isVisible()).toBe(false);
    });

    it("adds a field for text, audio, or video when a button is clicked", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: {
                    ...mockEnglishContent,
                    text: undefined,
                },
                docType: DocType.Post,
            },
        });

        await wrapper.find("button[data-test='addText']").trigger("click");
        await wrapper.find("button[data-test='addAudio']").trigger("click");
        await wrapper.find("button[data-test='addVideo']").trigger("click");

        const textEditor = await wrapper.findComponent(RichTextEditor);
        const audioInput = await wrapper.find("input[name='audio']");
        const videoInput = await wrapper.find("input[name='video']");
        expect(textEditor.isVisible()).toBe(true);
        expect(audioInput.isVisible()).toBe(true);
        expect(videoInput.isVisible()).toBe(true);
    });

    it("displays when there are unsaved changes", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        await wrapper.find("input[name='title']").setValue("Updated Title");

        expect(wrapper.text()).toContain("Unsaved changes");
    });

    it("displays a badge when there are offline changes", async () => {
        const localChangeStore = useLocalChangeStore();

        // @ts-expect-error - Property is read-only but we are mocking it
        localChangeStore.isLocalChange = () => true;

        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        expect(wrapper.text()).toContain("Offline changes");
    });

    it("shows and saves the selected tags", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                docType: DocType.Post,
            },
        });

        expect(wrapper.text()).toContain("Category 1");

        await wrapper.find("button[data-test='removeTag']").trigger("click");
        expect(wrapper.text()).not.toContain("Category 1");

        await wrapper.find(saveAsDraftButton).trigger("click");
        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);

            expect(saveEvent![0][1].tags).toEqual([]);
        });
    });

    describe("validation", () => {
        it("does not submit invalid forms", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });

            await wrapper.find("input[name='title']").setValue("");

            await wrapper.find(saveAsDraftButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).toBe(undefined);
            });
        });

        it("displays why a post cannot be published", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: {
                        ...mockPost,
                        tags: [],
                    },
                    content: mockUnpublishableContent,
                    docType: DocType.Post,
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).toBe(undefined);

                expect(wrapper.text()).toContain(
                    "At least one of text, audio or video content is required",
                );
                expect(wrapper.text()).toContain("At least one tag is required");
            });
        });

        it("can publish a tag", async () => {
            const category = { ...mockCategory };
            category.image = "";

            const wrapper = mount(EditContentForm, {
                props: {
                    parent: {
                        ...mockCategory,
                        tags: [],
                    },
                    content: mockUnpublishableContent,
                    docType: DocType.Tag,
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).not.toBe(undefined);

                expect(wrapper.text()).not.toContain(
                    "At least one of text, audio or video content is required",
                );
                expect(wrapper.text()).not.toContain("At least one tag is required");
            });
        });

        it("displays a notification after saving", async () => {
            const notificationStore = useNotificationStore();
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });

            await wrapper.find(saveAsDraftButton).trigger("click");

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: "Changes saved as draft",
                        state: "success",
                    }),
                );
            });
        });

        it("sets a default for the publish date when publishing", async () => {
            const currentTime = DateTime.fromISO("2024-04-22T10:42:00.00");
            Settings.now = () => currentTime.toMillis();
            const content = { ...mockEnglishContent };
            content.publishDate = undefined;

            const wrapper = mount(EditContentForm, {
                props: {
                    parent: {
                        ...mockPost,
                        content: [content],
                    },
                    content: content,
                    docType: DocType.Post,
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).not.toBe(undefined);

                expect(saveEvent![0][0].publishDate).toEqual(currentTime);
            });
        });

        it("doesn't set the publish date if one is set already", async () => {
            const currentTime = DateTime.fromISO("2024-04-22T10:42:00.00");
            const publishDate = DateTime.fromISO("2024-01-31T00:00:00.00");
            Settings.now = () => currentTime.toMillis();
            const content = { ...mockEnglishContent };
            content.publishDate = publishDate;

            const wrapper = mount(EditContentForm, {
                props: {
                    parent: {
                        ...mockPost,
                        content: [content],
                    },
                    content: content,
                    docType: DocType.Post,
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).not.toBe(undefined);

                expect(saveEvent![0][0].publishDate).toEqual(publishDate);
            });
        });

        it("displays a notification when saving with validation errors", async () => {
            const notificationStore = useNotificationStore();
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });

            await wrapper.find("input[name='title']").setValue(""); // Trigger validation error

            await wrapper.find(saveAsDraftButton).trigger("click");

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        state: "error",
                    }),
                );
            });

            // Check that both draft and publish trigger an error notification
            await wrapper.find(publishButton).trigger("click");
            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe("slug", () => {
        it("displays the slug", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: {
                        ...mockEnglishContent,
                        title: "Test title",
                        slug: "test-title",
                        status: ContentStatus.Draft,
                    },
                    docType: DocType.Post,
                },
            });

            const slug = wrapper.find("[data-test='slugSpan']");
            const title = wrapper.find("input[name='title']");

            // Check if the slug is displayed
            expect(slug.text()).toBe("test-title");

            await title.setValue("Updated Title");
            await flushPromises();

            // Check if the slug is updated
            expect(slug.text()).toBe("updated-title");
        });

        it("displays a text input when the slug edit button is pressed", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });

            await wrapper.find("button[data-test='editSlugButton']").trigger("click");

            const input = wrapper.find("input[name='slug']");
            expect(input.isVisible()).toBe(true);
        });

        it("saves the new slug when the text input loses focus and hides the input", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });
            const input = wrapper.find("input[name='slug']");
            const slug = wrapper.find("[data-test='slugSpan']");

            await wrapper.find("button[data-test='editSlugButton']").trigger("click");
            await input.setValue("new-slug");
            await input.trigger("blur");

            expect(slug.text()).toBe("new-slug");
            expect(input.isVisible()).toBe(false);
            expect(slug.isVisible()).toBe(true);
        });

        it("does not update the slug if the slug has been edited and the title is changed", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });
            const input = wrapper.find("input[name='slug']");
            const title = wrapper.find("input[name='title']");
            const slug = wrapper.find("[data-test='slugSpan']");

            await wrapper.find("button[data-test='editSlugButton']").trigger("click");
            await input.setValue("new-slug");
            await input.trigger("blur");
            await title.setValue("New Title 123");

            expect(slug.text()).toBe("new-slug");
        });

        it("does not update the slug if the slug has been edited and the title is cleared before a new title is added", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    docType: DocType.Post,
                },
            });
            const input = wrapper.find("input[name='slug']");
            const title = wrapper.find("input[name='title']");
            const slug = wrapper.find("[data-test='slugSpan']");

            await wrapper.find("button[data-test='editSlugButton']").trigger("click");
            await input.setValue("new-slug");
            await input.trigger("blur");
            await title.setValue("");
            await title.setValue("New title");

            expect(slug.text()).toBe("new-slug");
        });

        it("does not update the slug if the content status is 'published'", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: {
                        ...mockEnglishContent,
                        title: "Test title",
                        slug: "test-title",
                        status: ContentStatus.Published,
                    },
                    docType: DocType.Post,
                },
            });

            const title = wrapper.find("input[name='title']");
            const slug = wrapper.find("[data-test='slugSpan']");

            await title.setValue("New Title 123");

            expect(slug.text()).toBe("test-title");
        });
    });

    describe("permissions", () => {
        const createWrapperWithoutPermissions = (content?: Content, docType?: DocType) => {
            const userAccessStore = useUserAccessStore();
            userAccessStore.accessMap = {};
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: content ?? mockEnglishContent,
                    docType: docType ?? DocType.Post,
                },
            });

            return wrapper;
        };

        it("hides the slug button when the user doesn't have permission to edit", async () => {
            const wrapper = createWrapperWithoutPermissions();

            expect(wrapper.find("button[data-test='editSlugButton']").exists()).toBe(false);
        });

        it("disables both save buttons when the user doesn't have permission to edit", async () => {
            const wrapper = createWrapperWithoutPermissions();

            expect(wrapper.find(saveAsDraftButton).attributes().disabled).toBeDefined();
            expect(wrapper.find(publishButton).attributes().disabled).toBeDefined();
        });

        it("disables the publish button when the user can't publish but can translate", async () => {
            const userAccessStore = useUserAccessStore();
            const wrapper = createWrapperWithoutPermissions();
            userAccessStore.accessMap = translateAccessToAllContent;
            await nextTick();

            expect(wrapper.find(saveAsDraftButton).attributes().disabled).toBeUndefined();
            expect(wrapper.find(publishButton).attributes().disabled).toBeDefined();
        });

        it("disables all content fields when the user doesn't have permission to edit", async () => {
            const wrapper = createWrapperWithoutPermissions(
                {
                    ...mockEnglishCategoryContent,
                    audio: "abc",
                    video: "def",
                },
                DocType.Tag,
            );

            // Content fields
            expect(wrapper.find("input[name='title']").attributes().disabled).toBeDefined();
            expect(wrapper.find("input[name='summary']").attributes().disabled).toBeDefined();
            expect(wrapper.find("input[name='publishDate']").attributes().disabled).toBeDefined();
            expect(wrapper.find("input[name='audio']").attributes().disabled).toBeDefined();
            expect(wrapper.find("input[name='video']").attributes().disabled).toBeDefined();
            expect(wrapper.findComponent(RichTextEditor).props().disabled).toBe(true);
            // Parent fields
            expect(wrapper.find("input[name='parent.image']").attributes().disabled).toBeDefined();
            expect(wrapper.findComponent(TagSelector).props().disabled).toBe(true);
            expect(wrapper.findComponent(LToggle).props().disabled).toBe(true);
            expect(wrapper.findComponent(LTag).props().disabled).toBe(true);
        });

        it("only disables parent fields when the user can translate but not edit", async () => {
            const userAccessStore = useUserAccessStore();
            const wrapper = createWrapperWithoutPermissions(
                {
                    ...mockEnglishCategoryContent,
                    audio: "abc",
                    video: "def",
                },
                DocType.Tag,
            );
            userAccessStore.accessMap = translateAccessToAllContent;
            await nextTick();

            // Content fields
            expect(wrapper.find("input[name='title']").attributes().disabled).toBeUndefined();
            expect(wrapper.find("input[name='summary']").attributes().disabled).toBeUndefined();
            expect(wrapper.find("input[name='publishDate']").attributes().disabled).toBeUndefined();
            expect(wrapper.find("input[name='audio']").attributes().disabled).toBeUndefined();
            expect(wrapper.find("input[name='video']").attributes().disabled).toBeUndefined();
            expect(wrapper.findComponent(RichTextEditor).props().disabled).toBe(false);
            // Parent fields
            expect(wrapper.findComponent(TagSelector).props().disabled).toBe(true);
            expect(wrapper.find("input[name='parent.image']").attributes().disabled).toBeDefined();
            expect(wrapper.findComponent(LToggle).props().disabled).toBe(true);
            expect(wrapper.findComponent(LTag).props().disabled).toBe(true);
        });
    });
});
