import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ContentForm from "./ContentForm.vue";
import { mockContent, mockLanguageEng, mockLanguageFra, mockPost } from "@/tests/mockData";
import waitForExpect from "wait-for-expect";

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
            const saveEvent = wrapper.emitted("save");
            expect(saveEvent).not.toBe(undefined);
            expect(saveEvent).toHaveLength(1);
        });
    });
});
