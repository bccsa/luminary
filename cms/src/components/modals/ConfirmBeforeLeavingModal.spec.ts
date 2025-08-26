import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmBeforeLeavingModal from "./ConfirmBeforeLeavingModal.vue";
import { useRouter } from "vue-router";
import LDialog from "../common/LDialog.vue";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

const onBeforeRouteLeave = vi.hoisted(() =>
    vi.fn().mockImplementation(() => (cb: Function) => cb()),
);

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        createRouter: () => ({
            push: vi.fn(),
            beforeEach: vi.fn(),
            afterEach: vi.fn(),
        }),
        useRouter: () => ({
            push: vi.fn(),
        }),
        onBeforeRouteLeave,
    };
});

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

        const modal = wrapper.findComponent(LDialog);
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

        const modal = wrapper.findComponent(LDialog);
        await waitForExpect(() => {
            expect(modal.props().open).toBe(false);
        });
    });
});
