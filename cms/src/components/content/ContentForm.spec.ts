import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentForm from "./ContentForm.vue";
import { mockContent, mockPost } from "@/tests/mockData";
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

            expect(wrapper.text()).toContain("Form not valid");
        });
    });
});
