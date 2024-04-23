import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { RouterLinkStub, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentTable from "./ContentTable.vue";
import { mockFrenchContent, mockLanguageEng, mockLanguageFra, mockPost } from "@/tests/mockData";
import LBadge from "@/components/common/LBadge.vue";
import { useLanguageStore } from "@/stores/language";
import { setActivePinia } from "pinia";
import { useLocalChangeStore } from "@/stores/localChanges";
import { DocType } from "@/types";

describe("ContentTable", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays the content for the given items", async () => {
        const languageStore = useLanguageStore();

        languageStore.languages = [mockLanguageEng];

        const wrapper = mount(ContentTable, {
            props: {
                items: [mockPost],
                editLinkName: "posts.edit",
                docType: DocType.Post,
            },
        });

        expect(wrapper.html()).toContain("English translation title");

        // Assert there is a badge that indicates a published translation
        const badge = await wrapper.findComponent(LBadge);
        expect(badge.props().variant).toBe("success");

        // Assert there is an edit link to the right place
        const routerLink = await wrapper.findComponent(RouterLinkStub);
        expect(routerLink.props().to).toEqual({
            name: "posts.edit",
            params: {
                id: mockPost._id,
                language: "eng",
            },
        });
    });

    it("displays a different translation title if the default isn't available", async () => {
        const languageStore = useLanguageStore();

        languageStore.languages = [mockLanguageEng, mockLanguageFra];

        const wrapper = mount(ContentTable, {
            props: {
                items: [
                    {
                        ...mockPost,
                        content: [mockFrenchContent],
                    },
                ],
                editLinkName: "posts.edit",
                docType: DocType.Post,
            },
        });

        expect(wrapper.html()).toContain("French translation title");
    });

    it("displays a badge for a post with local unsynced changes", async () => {
        const languageStore = useLanguageStore();
        const localChangeStore = useLocalChangeStore();

        languageStore.languages = [mockLanguageEng];
        // @ts-expect-error - Property is read-only but we are mocking it
        localChangeStore.isLocalChange = () => true;

        const wrapper = mount(ContentTable, {
            props: {
                items: [mockPost],
                editLinkName: "posts.edit",
                docType: DocType.Post,
            },
        });

        // Assert there is a badge that indicates a post has unsynced local changes
        const badge = wrapper.findComponent(LBadge);
        expect(badge.props().variant).toBe("warning");
        expect(badge.text()).toContain("Offline changes");
    });

    it("can handle empty content", async () => {
        const post = {
            ...mockPost,
            content: [],
        };

        const wrapper = mount(ContentTable, {
            props: {
                items: [post],
                editLinkName: "posts.edit",
                docType: DocType.Post,
            },
        });

        expect(wrapper.html()).toContain("No translation");
    });
});
