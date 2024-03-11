import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ContentForm from "./ContentForm.vue";
import { mockEnglishContent, mockPost, mockUnpublishableContent } from "@/tests/mockData";
import waitForExpect from "wait-for-expect";
import { ContentStatus, DocType } from "@/types";
import { useLocalChangeStore } from "@/stores/localChanges";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

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
        count: vi.fn().mockReturnValue(0),
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

describe("ContentForm", () => {
    const saveAsDraftButton = "button[data-test='draft']";
    const publishButton = "button[data-test='publish']";

    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can save as draft", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
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
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
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
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
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
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
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

    it("does not submit invalid forms", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
            },
        });

        await wrapper.find("input[name='title']").setValue("");

        await wrapper.find(saveAsDraftButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).toBe(undefined);
        });
    });

    it("does not display text, audio or video when not defined", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: {
                    ...mockEnglishContent,
                    text: undefined,
                },
            },
        });

        const textInput = await wrapper.find("input[name='text']");
        const audioInput = await wrapper.find("input[name='audio']");
        const videoInput = await wrapper.find("input[name='video']");
        expect(textInput.isVisible()).toBe(false);
        expect(audioInput.isVisible()).toBe(false);
        expect(videoInput.isVisible()).toBe(false);
    });

    it("adds a field for text, audio, or video when a button is clicked", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: {
                    ...mockEnglishContent,
                    text: undefined,
                },
            },
        });

        await wrapper.find("button[data-test='addText']").trigger("click");
        await wrapper.find("button[data-test='addAudio']").trigger("click");
        await wrapper.find("button[data-test='addVideo']").trigger("click");

        const textInput = await wrapper.find("input[name='text']");
        const audioInput = await wrapper.find("input[name='audio']");
        const videoInput = await wrapper.find("input[name='video']");
        expect(textInput.isVisible()).toBe(true);
        expect(audioInput.isVisible()).toBe(true);
        expect(videoInput.isVisible()).toBe(true);
    });

    it("displays why a post cannot be published", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockUnpublishableContent,
            },
        });

        await wrapper.find(publishButton).trigger("click");

        await waitForExpect(() => {
            const saveEvent: any = wrapper.emitted("save");
            expect(saveEvent).toBe(undefined);

            expect(wrapper.text()).toContain("Summary is required");
            expect(wrapper.text()).toContain("Publish date is required");
            expect(wrapper.text()).toContain(
                "At least one of text, audio or video content is required",
            );
        });
    });

    it("displays when there are unsaved changes", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
            },
        });

        await wrapper.find("input[name='title']").setValue("Updated Title");

        expect(wrapper.text()).toContain("Unsaved changes");
    });

    it("displays a badge when there are offline changes", async () => {
        const localChangeStore = useLocalChangeStore();

        // @ts-expect-error - Property is read-only but we are mocking it
        localChangeStore.isLocalChange = () => true;

        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
            },
        });

        expect(wrapper.text()).toContain("Offline changes");
    });

    it("displays the slug", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
            },
        });

        expect(wrapper.text()).toContain(mockEnglishContent.slug);

        await wrapper.find("input[name='title']").setValue("Updated Title");

        await flushPromises();
        expect(wrapper.text()).toContain("Slug:updated-title");
    });

    it("shows and saves the selected tags", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockEnglishContent,
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
});
