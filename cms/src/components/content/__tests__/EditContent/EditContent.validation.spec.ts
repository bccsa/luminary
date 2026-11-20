import { describe, it, afterEach, beforeEach, expect, vi } from "vitest";

// Set up mocks before any imports
vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
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
import { db, DocType, type ContentDto, type PostDto, PostType } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import { useNotificationStore } from "@/stores/notification";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    mockPostDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockSwahiliContentDto,
} from "./EditContent.test-utils";

describe("EditContent - Validation & Error Handling", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("doesn't save when the content is invalid", async () => {
        const notificationStore = useNotificationStore();
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // Wait for the component to fetch data
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });

        // Simulate enabling dirty state
        const titleInput = wrapper.find('input[name="title"]');
        await titleInput.setValue("");

        // Click the save button
        wrapper.find('[data-test="save-button"]').trigger("click");

        // Check that the saved version hasn't changed and that an error notification was shown
        await waitForExpect(async () => {
            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc.title).toBe(mockEnglishContentDto.title);
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: "error",
                }),
            );
        });
    });

    it("saves when dates are linked and only one translation has a publish date", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, linkDates: true } as PostDto]);
        await db.docs.bulkPut([{ ...mockFrenchContentDto, publishDate: undefined } as ContentDto]);

        const notificationStore = useNotificationStore();
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
        await wrapper.find('input[name="title"]').setValue("New Title");
        await wrapper.find('[data-test="save-button"]').trigger("click");

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "success" }),
            );
            const french = await db.get<ContentDto>(mockFrenchContentDto._id);
            expect(french.publishDate).toBe(mockEnglishContentDto.publishDate);
        });
    });

    const saveTitleChange = async (languageCode: string) => {
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode,
                tagOrPostType: PostType.Blog,
            },
        });
        await waitForExpect(() => {
            expect(wrapper.find('input[name="title"]').exists()).toBe(true);
        });
        await wrapper.find('input[name="title"]').setValue("New Title");
        await wrapper.find('[data-test="save-button"]').trigger("click");
    };

    it("fills a dateless linked translation from the translation being edited", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, linkDates: true } as PostDto]);
        await db.docs.bulkPut([
            // Older than the English date, so it is not simply the first dated translation
            { ...mockFrenchContentDto, publishDate: 1704000000000, expiryDate: 1704900000000 },
            { ...mockSwahiliContentDto, publishDate: undefined },
        ] as ContentDto[]);

        const notificationStore = useNotificationStore();
        await saveTitleChange("fr");

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "success" }),
            );
            const swahili = await db.get<ContentDto>(mockSwahiliContentDto._id);
            expect(swahili.publishDate).toBe(1704000000000);
            expect(swahili.expiryDate).toBe(1704900000000);
        });
    });

    it("replaces a dateless linked translation's own expiry so it is not saved expired", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, linkDates: true } as PostDto]);
        await db.docs.bulkPut([
            // Expires before the English publish date it is about to receive
            { ...mockFrenchContentDto, publishDate: undefined, expiryDate: 1700000000000 },
        ] as ContentDto[]);

        const notificationStore = useNotificationStore();
        await saveTitleChange("eng");

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "success" }),
            );
            const french = await db.get<ContentDto>(mockFrenchContentDto._id);
            expect(french.publishDate).toBe(mockEnglishContentDto.publishDate);
            expect(french.expiryDate).toBe(mockEnglishContentDto.expiryDate);
        });
    });

    it("blocks the save when dates are not linked and a translation has no publish date", async () => {
        await db.docs.bulkPut([
            { ...mockFrenchContentDto, publishDate: undefined },
        ] as ContentDto[]);

        const notificationStore = useNotificationStore();
        await saveTitleChange("eng");

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({ state: "error" }),
            );
        });
        const english = await db.get<ContentDto>(mockEnglishContentDto._id);
        const french = await db.get<ContentDto>(mockFrenchContentDto._id);
        expect(english.title).toBe(mockEnglishContentDto.title);
        expect(french.publishDate).toBeUndefined();
    });

    it("routes back to overview if parent is not found in the database", async () => {
        const notificationStore = useNotificationStore();
        mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: { ...mockPostDto, _id: "post-post5" }._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(notificationStore.addNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: "Parent not found",
                    description: "The parent document was not found in the database",
                }),
            );
        });
    });
});
