import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import EditContentForm from "./EditContentForm.vue";
import {
    mockCategory,
    mockEnglishContent,
    mockPost,
    mockUnpublishableContent,
} from "@/tests/mockData";
import waitForExpect from "wait-for-expect";
import { ContentStatus, DocType } from "@/types";
import { useLocalChangeStore } from "@/stores/localChanges";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import RichTextEditor from "./RichTextEditor.vue";
import { useNotificationStore } from "@/stores/notification";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
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
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can save as draft", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
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
                ruleset: "post",
            },
        });

        expect(wrapper.text()).toContain("Offline changes");
    });

    it("shows and saves the selected tags", async () => {
        const wrapper = mount(EditContentForm, {
            props: {
                parent: mockPost,
                content: mockEnglishContent,
                ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).toBe(undefined);

                expect(wrapper.text()).toContain("Publish date is required");
                expect(wrapper.text()).toContain(
                    "At least one of text, audio or video content is required",
                );
                expect(wrapper.text()).toContain("At least one tag is required");
            });
        });

        it("displays why a tag can't be published", async () => {
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: {
                        ...mockCategory,
                        tags: [],
                    },
                    content: mockUnpublishableContent,
                    ruleset: "tag",
                },
            });

            await wrapper.find(publishButton).trigger("click");

            await waitForExpect(() => {
                const saveEvent: any = wrapper.emitted("save");
                expect(saveEvent).toBe(undefined);

                expect(wrapper.text()).toContain("Publish date is required");
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
                    ruleset: "post",
                },
            });

            await wrapper.find(saveAsDraftButton).trigger("click");

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: "Post saved as draft",
                        state: "success",
                    }),
                );
            });
        });

        it("displays a notification when saving with validation errors", async () => {
            const notificationStore = useNotificationStore();
            const wrapper = mount(EditContentForm, {
                props: {
                    parent: mockPost,
                    content: mockEnglishContent,
                    ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
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
                    ruleset: "post",
                },
            });

            const title = wrapper.find("input[name='title']");
            const slug = wrapper.find("[data-test='slugSpan']");

            await title.setValue("New Title 123");

            expect(slug.text()).toBe("test-title");
        });
    });
});
