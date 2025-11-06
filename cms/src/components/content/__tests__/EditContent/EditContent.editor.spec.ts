import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";

// Set up mocks before any imports
vi.mock("@auth0/auth0-vue", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useAuth0: () => ({
            user: { name: "Test User", email: "test@example.com" },
            logout: vi.fn(),
            loginWithRedirect: vi.fn(),
            isAuthenticated: true,
            isLoading: false,
        }),
        authGuard: vi.fn(),
    };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            back: vi.fn(),
            currentRoute: {
                value: {
                    name: "edit",
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// @ts-expect-error
window.scrollTo = vi.fn();

import { mount } from "@vue/test-utils";
import { db, DocType, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import EditContentText from "../../EditContentText.vue";
import EditContentBasic from "../../EditContentBasic.vue";
import RichTextEditor from "../../../editor/RichTextEditor.vue";
import LTextToggle from "../../../forms/LTextToggle.vue";
import waitForExpect from "wait-for-expect";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
} from "./EditContent.test-utils";

describe("EditContent - Rich Text Editor and Slug Management", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("correctly updates text field in indexedDB from rich text editor", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        const editContentBasic = wrapper.findComponent(EditContentText);
        const richTextEditor = editContentBasic.findComponent(RichTextEditor);
        expect(richTextEditor.exists()).toBe(true);

        const authorInput = wrapper.find('input[name="author"]');
        expect(authorInput.exists()).toBe(true);
        await authorInput.setValue("New Author");

        //@ts-ignore -- valid code
        await richTextEditor.vm.editor.commands.setContent("<p>New Content</p>");

        // Trigger the update event to save the content
        //@ts-ignore -- valid code
        const updatedContent = richTextEditor.vm.editor.getJSON();
        //@ts-ignore -- valid code
        richTextEditor.vm.text = JSON.stringify(updatedContent);

        await waitForExpect(() => {
            expect(richTextEditor.vm.text).toContain("New Content");
            expect(wrapper.html()).toContain("New Content");
        });

        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.exists()).toBe(true);
        await saveButton.trigger("click");

        await waitForExpect(async () => {
            const res = await db.localChanges.toArray();

            expect(res.length).toBe(2);
            expect(JSON.parse((res[1].doc as any).text).content[0].content[0].text).toBe(
                "New Content",
            );
        });
    });

    it("should generate a redirect if a slug has been changed", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            // Edit the slug to trigger a redirect creation
            const editContentBasic = wrapper.findComponent(EditContentBasic);
            const toogle = editContentBasic.findAllComponents(LTextToggle)[0];
            const visible = toogle.find('[data-test="text-toggle-left-value"]');
            expect(visible.exists()).toBe(true);

            expect(wrapper.find('[data-test="slugSpan"]').exists()).toBe(true);
            await wrapper.find('[data-test="slugSpan"]').trigger("click");
            await wrapper.find('[name="slug"]').setValue("new-slug");
            await wrapper.find('[name="slug"]').trigger("change");
        });

        await waitForExpect(async () => {
            await wrapper.find('[data-test="save-button"]').trigger("click");
        });

        await waitForExpect(async () => {
            const res = await db.localChanges.toArray();
            expect(res.length).toBeGreaterThan(0);

            // Check if a redirect was created with the new slug.
            expect(res.length).toBe(3);
            const redirect = res.filter((o) => o.doc?.type === DocType.Redirect);
            expect(redirect.length).toBe(1);
            expect((redirect[0].doc as any).slug).toBe("post1-eng");
            expect((redirect[0].doc as any).toSlug).toBe("new-slug");
        });
    });
});
