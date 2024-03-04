import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentForm from "./ContentForm.vue";
import { mockContent, mockPost, mockUnpublishableContent } from "@/tests/mockData";
import waitForExpect from "wait-for-expect";
import { ContentStatus, DocType } from "@/types";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

describe("ContentForm", () => {
    beforeEach(() => {});

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("can save as draft", async () => {
        const wrapper = mount(ContentForm, {
            props: {
                post: mockPost,
                content: mockContent,
            },
        });

        await wrapper.find("button[data-test='draft']").trigger("click");

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
                content: mockContent,
            },
        });

        await wrapper.find("button[data-test='publish']").trigger("click");

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
                content: mockContent,
            },
        });

        await wrapper.find("input[name='title']").setValue("Updated Title");
        await wrapper.find("input[name='summary']").setValue("Updated Summary");

        await wrapper.find("button[data-test='draft']").trigger("click");

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
                content: mockContent,
            },
        });

        await wrapper.find("input[name='parent.image']").setValue("updatedImage.jpg");

        await wrapper.find("button[data-test='draft']").trigger("click");

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
                content: mockContent,
            },
        });

        await wrapper.find("input[name='title']").setValue("");

        await wrapper.find("button[data-test='draft']").trigger("click");

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
                    ...mockContent,
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
                    ...mockContent,
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

        await wrapper.find("button[data-test='publish']").trigger("click");

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
                content: mockContent,
            },
        });

        await wrapper.find("input[name='title']").setValue("Updated Title");

        expect(wrapper.text()).toContain("Unsaved changes");
    });
});
