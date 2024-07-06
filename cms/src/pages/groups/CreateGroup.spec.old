import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import CreateGroup from "./CreateGroup.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useLanguageStore } from "@/stores/language";
import { mockLanguageEng, mockLanguageFra } from "@/tests/mockData";
import { useGroupStore } from "@/stores/group";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    useRouter: vi.fn().mockImplementation(() => ({
        replace: routePushMock,
    })),
}));

describe("CreateGroup", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const languageStore = useLanguageStore();
        languageStore.languages = [mockLanguageEng, mockLanguageFra];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the initial form", async () => {
        const wrapper = mount(CreateGroup);

        expect(wrapper.html()).toContain("Name");
    });

    it("can submit the form", async () => {
        const groupStore = useGroupStore();
        const notificationStore = useNotificationStore();

        const wrapper = mount(CreateGroup);

        await wrapper.find("input[name='name']").setValue("New group name");

        await wrapper.find("form").trigger("submit.prevent");

        await flushPromises();
        await waitForExpect(() => {
            expect(groupStore.createGroup).toHaveBeenCalledWith({ name: "New group name" });
            expect(notificationStore.addNotification).toHaveBeenCalled();
            expect(routePushMock).toHaveBeenCalled();
        });
    });

    it("validates the form", async () => {
        const wrapper = mount(CreateGroup);

        await wrapper.find("input[name='name']").setValue("");

        await flushPromises();
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Name is a required field");
        });
    });
});
