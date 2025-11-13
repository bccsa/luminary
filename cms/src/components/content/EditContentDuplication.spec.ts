import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { db, DocType, accessMap, PostType } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContent from "./EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import { initLanguage } from "@/globalConfig";
import { nextTick } from "vue";

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

// @ts-expect-error
window.scrollTo = vi.fn();

describe("EditContent.vue - Duplication", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        await db.docs.clear();
        await db.localChanges.clear();

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

    it("resets tag-related fields when duplicating a document", async () => {
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
        await duplicateBtn!.trigger("click");

        const confirmBtn = wrapper.find('[data-test="modal-primary-button"]');
        if (confirmBtn.exists()) {
            await confirmBtn.trigger("click");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vm: any = wrapper.vm;

        const newParentId = vm.editableParent._id as string;
        expect(newParentId).not.toBe(mockData.mockPostDto._id);

        expect(Array.isArray(vm.editableParent.tags)).toBe(true);
        expect(vm.editableParent.tags).toEqual([]);

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
});
