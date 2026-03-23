import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { db, DocType, accessMap, PostType, TagType, type TagDto, PublishStatus } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContent from "./EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import { initLanguage } from "@/globalConfig";
import { nextTick } from "vue";

const mockRouterReplace = vi.hoisted(() => vi.fn());

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
            currentRoute: {
                value: {
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

vi.mock("@/router", () => ({
    default: {
        replace: mockRouterReplace,
        push: vi.fn(),
        currentRoute: { value: { meta: {} } },
    },
}));

// @ts-expect-error
window.scrollTo = vi.fn();

describe("EditContent.vue - Duplication", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        await db.docs.clear();
        await db.localChanges.clear();
        mockRouterReplace.mockClear();

        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([
            mockData.mockEnglishContentDto,
            mockData.mockFrenchContentDto,
            mockData.mockSwahiliContentDto,
        ]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        accessMap.value = { ...mockData.superAdminAccessMap };
        initLanguage();
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        vi.clearAllMocks();
    });

    it("correctly creates a duplicate of a document and all its translations", async () => {
        const mockNotification = vi.fn();
        const notificationStore = useNotificationStore();
        notificationStore.addNotification = mockNotification;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        // Click the dropdown chevron to open the menu
        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        expect(dropdownTrigger.exists()).toBe(true);
        await dropdownTrigger.trigger("click");
        await nextTick();

        // Find and click the duplicate button inside the dropdown
        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });

        await confirmBtn!.trigger("click");

        await waitForExpect(() => {
            expect(mockNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: "Successfully duplicated",
                }),
            );
        });

        //@ts-expect-error
        const newParentId = wrapper.vm.editableParent._id;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        await wrapper.setProps({ id: newParentId });
        await nextTick();
        await nextTick();

        await wrapper.find("[data-test='save-button']").trigger("click");

        await waitForExpect(async () => {
            const res = await db.localChanges.where({ docId: wrapper.vm.$props.id }).toArray();
            expect(res.length).toBeGreaterThan(0);
        });
    }, 15000); // Increase timeout for CI

    it("does not create a redirect when duplicating a document", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        // Click the dropdown chevron to open the menu
        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        expect(dropdownTrigger.exists()).toBe(true);
        await dropdownTrigger.trigger("click");
        await nextTick();

        // Find and click the duplicate button inside the dropdown
        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        await duplicateBtn!.trigger("click");

        const confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
        if (confirmBtn.exists()) {
            await confirmBtn.trigger("click");
        }

        //@ts-expect-error
        const newParentId = wrapper.vm.editableParent._id;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        await wrapper.setProps({ id: newParentId });
        await nextTick();
        await nextTick();

        const saveBtn = wrapper.find('[data-test="save-button"]');
        expect(saveBtn.exists()).toBe(true);
        await saveBtn.trigger("click");

        await waitForExpect(async () => {
            const changes = await db.localChanges.toArray();
            const redirects = changes.filter((c) => c.doc?.type === DocType.Redirect);
            expect(redirects.length).toBe(0);
        });
    });

    it("preserves parent tags but clears cached parentTags on content when duplicating", async () => {
        await db.docs.put({
            ...mockData.mockPostDto,
            tags: ["tag-category2", "tag-topicA"],
        } as any);

        await db.docs.bulkPut([
            {
                ...mockData.mockEnglishContentDto,
                parentTags: ["old-parent-tag"],
                parentTaggedDocs: ["old-parent-doc-id"],
            } as any,
            {
                ...mockData.mockFrenchContentDto,
                parentTags: ["old-parent-tag"],
                parentTaggedDocs: ["old-parent-doc-id"],
            } as any,
            {
                ...mockData.mockSwahiliContentDto,
                parentTags: ["old-parent-tag"],
                parentTaggedDocs: ["old-parent-doc-id"],
            } as any,
        ]);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        // Wait for parent to be fully loaded from the DB with custom tags
        await waitForExpect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vm: any = wrapper.vm;
            expect(vm.editableParent.tags).toEqual(["tag-category2", "tag-topicA"]);
        });

        // Click the dropdown chevron to open the menu
        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        expect(dropdownTrigger.exists()).toBe(true);
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        const newParentId = vm.editableParent._id as string;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        // Parent tags (categories) should be preserved on the duplicated document
        expect(Array.isArray(vm.editableParent.tags)).toBe(true);
        expect(vm.editableParent.tags).toEqual(["tag-category2", "tag-topicA"]);

        // Cached parentTags on content docs should be cleared (repopulated by the API on save)
        expect(Array.isArray(vm.editableContent)).toBe(true);
        vm.editableContent.forEach((c: any) => {
            expect(c.parentId).toBe(newParentId);
            expect(Array.isArray(c.parentTags)).toBe(true);
            expect(c.parentTags).toEqual([]);
            expect(Array.isArray(c.parentTaggedDocs)).toBe(true);
            expect(c.parentTaggedDocs).toEqual([]);
            expect("tags" in c).toBe(false);
        });
    }, 15000);

    it("uses the duplicated document's id when navigating between languages after duplication", async () => {
        const mockNotification = vi.fn();
        const notificationStore = useNotificationStore();
        notificationStore.addNotification = mockNotification;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        // Open the dropdown menu and trigger duplication
        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        expect(dropdownTrigger.exists()).toBe(true);
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });

        await confirmBtn!.trigger("click");

        await waitForExpect(() => {
            expect(mockNotification).toHaveBeenCalledWith(
                expect.objectContaining({ title: "Successfully duplicated" }),
            );
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;
        const newParentId = vm.editableParent._id as string;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        // Reset spy to only track calls triggered by the language switch below
        mockRouterReplace.mockClear();

        // Simulate the user clicking a different translation tab (French)
        await wrapper.setProps({ languageCode: "fr" });
        await nextTick();

        // The selectedLanguage watcher should navigate using the new (duplicated) parentId
        expect(mockRouterReplace).toHaveBeenCalledWith(expect.stringContaining(newParentId));
        // And must NOT use the original document's id
        expect(mockRouterReplace).not.toHaveBeenCalledWith(
            expect.stringContaining(mockData.mockPostDto._id),
        );
    }, 15000);

    it("generates new unique IDs for parent and all content documents", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        // Parent should have a new ID
        expect(vm.editableParent._id).not.toBe(mockData.mockPostDto._id);

        // All content docs should have new unique IDs different from originals
        const originalContentIds = [
            mockData.mockEnglishContentDto._id,
            mockData.mockFrenchContentDto._id,
            mockData.mockSwahiliContentDto._id,
        ];
        const newContentIds = vm.editableContent.map((c: any) => c._id);

        // No new ID should match any original ID
        for (const newId of newContentIds) {
            expect(originalContentIds).not.toContain(newId);
        }

        // All new content IDs should be unique among themselves
        const uniqueIds = new Set(newContentIds);
        expect(uniqueIds.size).toBe(newContentIds.length);
    }, 15000);

    it("duplicates all translations and sets correct content properties", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;
        const newParentId = vm.editableParent._id as string;

        // All 3 translations should be duplicated
        expect(vm.editableContent.length).toBe(3);

        vm.editableContent.forEach((c: any) => {
            // Titles should have "(Copy)" suffix
            expect(c.title).toMatch(/\(Copy\)$/);

            // Slugs should have "-copy" suffix
            expect(c.slug).toMatch(/-copy$/);

            // Status should be set to Draft
            expect(c.status).toBe(PublishStatus.Draft);

            // parentId should reference the new cloned parent
            expect(c.parentId).toBe(newParentId);

            // parentType should be set
            expect(c.parentType).toBe(DocType.Post);

            // _rev should be removed (new document, not yet saved)
            expect(c._rev).toBeUndefined();
        });

        // Parent _rev should also be removed
        expect(vm.editableParent._rev).toBeUndefined();
    }, 15000);

    it("clears image fileCollections on the duplicated parent", async () => {
        // Ensure the mock post has image data with fileCollections
        expect(mockData.mockPostDto.imageData?.fileCollections.length).toBeGreaterThan(0);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        // Verify parent has image data before duplication
        await waitForExpect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vm: any = wrapper.vm;
            expect(vm.editableParent.imageData?.fileCollections.length).toBeGreaterThan(0);
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        // Image fileCollections should be cleared on the duplicated parent
        expect(vm.editableParent.imageData.fileCollections).toEqual([]);
    }, 15000);

    it("does not modify the original document in the database after duplication", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // The original parent document in the DB should be unchanged
        const originalParent = await db.docs.get(mockData.mockPostDto._id);
        expect(originalParent).toBeDefined();
        expect(originalParent!._id).toBe(mockData.mockPostDto._id);
        expect((originalParent as any).tags).toEqual(mockData.mockPostDto.tags);

        // The original content documents in the DB should be unchanged
        const originalEngContent = await db.docs.get(mockData.mockEnglishContentDto._id);
        expect(originalEngContent).toBeDefined();
        expect((originalEngContent as any).title).toBe(mockData.mockEnglishContentDto.title);
        expect((originalEngContent as any).slug).toBe(mockData.mockEnglishContentDto.slug);
        expect((originalEngContent as any).parentId).toBe(mockData.mockPostDto._id);
    }, 15000);

    it("clears taggedDocs when duplicating a Tag document", async () => {
        // Set up a Tag document with taggedDocs
        const tagWithDocs: TagDto = {
            ...mockData.mockCategoryDto,
            taggedDocs: ["post-post1", "post-post2"],
        };
        await db.docs.put(tagWithDocs as any);
        await db.docs.put(mockData.mockCategoryContentDto as any);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Tag,
                id: mockData.mockCategoryDto._id,
                languageCode: "eng",
                tagOrPostType: TagType.Category,
            },
        });

        await waitForExpect(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vm: any = wrapper.vm;
            expect(vm.editableParent._id).toBe(mockData.mockCategoryDto._id);
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        expect(dropdownTrigger.exists()).toBe(true);
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        // The duplicated tag should have taggedDocs cleared
        expect(vm.editableParent.taggedDocs).toEqual([]);

        // The duplicated tag should have a new ID
        expect(vm.editableParent._id).not.toBe(mockData.mockCategoryDto._id);

        // The tag type and other properties should be preserved
        expect(vm.editableParent.type).toBe(DocType.Tag);
        expect(vm.editableParent.tagType).toBe(TagType.Category);
    }, 15000);

    it("preserves parent memberOf and type properties after duplication", async () => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        // Type should be preserved
        expect(vm.editableParent.type).toBe(DocType.Post);
        expect(vm.editableParent.postType).toBe(PostType.Blog);

        // memberOf should be preserved
        expect(vm.editableParent.memberOf).toEqual(mockData.mockPostDto.memberOf);

        // publishDateVisible should be preserved
        expect(vm.editableParent.publishDateVisible).toBe(mockData.mockPostDto.publishDateVisible);
    }, 15000);

    it("preserves media on the duplicated parent", async () => {
        // The mock post has media data
        expect(mockData.mockPostDto.media).toBeDefined();
        expect(mockData.mockPostDto.media!.fileCollections.length).toBeGreaterThan(0);

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockData.mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("English");
        });

        const dropdownTrigger = wrapper.find('[role="button"][aria-haspopup="menu"]');
        await dropdownTrigger.trigger("click");
        await nextTick();

        let duplicateBtn;
        await waitForExpect(() => {
            duplicateBtn = wrapper.find("[data-test='duplicate-button']");
            expect(duplicateBtn.exists()).toBe(true);
        });

        let confirmBtn;
        await waitForExpect(async () => {
            duplicateBtn!.trigger("click");
            confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
            expect(confirmBtn.exists()).toBe(true);
        });
        await confirmBtn!.trigger("click");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        // Media should be preserved on the duplicated parent (unlike images which are cleared)
        expect(vm.editableParent.media).toBeDefined();
        expect(vm.editableParent.media.hlsUrl).toBe(mockData.mockPostDto.media!.hlsUrl);
        expect(vm.editableParent.media.fileCollections.length).toBe(
            mockData.mockPostDto.media!.fileCollections.length,
        );
    }, 15000);
});
