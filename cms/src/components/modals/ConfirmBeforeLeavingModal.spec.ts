import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmBeforeLeavingModal from "./ConfirmBeforeLeavingModal.vue";
import { useRouter } from "vue-router";
import LModal from "../common/LModal.vue";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {} // eslint-disable-line @typescript-eslint/no-empty-function
    disconnect() {} // eslint-disable-line @typescript-eslint/no-empty-function
};

const onBeforeRouteLeave = vi.hoisted(() =>
    vi.fn().mockImplementation(() => (cb: Function) => cb()),
);

vi.mock("vue-router", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
    onBeforeRouteLeave,
}));

describe("ConfirmBeforeLeavingModal", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("prevents the user from leaving the current route if there are unsaved changes", async () => {
        const router = useRouter();
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: true,
            },
        });

        await router.push({ name: "home" });

        const callback = onBeforeRouteLeave.mock.calls[0][0];
        expect(callback()).toBe(false);

        const modal = wrapper.findComponent(LModal);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(true);
        });
    });

    it("allows the user to change the route if there are no unsaved changes", async () => {
        const router = useRouter();
        const wrapper = mount(ConfirmBeforeLeavingModal, {
            props: {
                isDirty: false,
            },
        });

        await router.push({ name: "home" });

        const callback = onBeforeRouteLeave.mock.calls[0][0];
        expect(callback()).toBe(true);

        const modal = wrapper.findComponent(LModal);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(false);
        });
    });
});
