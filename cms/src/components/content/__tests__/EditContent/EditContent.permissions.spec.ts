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
import { db, DocType, accessMap, PostType, type ContentDto } from "luminary-shared";
import EditContent from "../../EditContent.vue";
import waitForExpect from "wait-for-expect";
import EditContentBasic from "../../EditContentBasic.vue";
import EditContentParent from "../../EditContentParent.vue";
import EditContentVideo from "../../EditContentVideo.vue";
import { useNotificationStore } from "@/stores/notification";
import {
    setupTestEnvironment,
    cleanupTestEnvironment,
    wait,
    mockPostDto,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockSwahiliContentDto,
    translateAccessToAllContentMap,
} from "./EditContent.test-utils";

describe("EditContent - Permissions & Access Control", () => {
    beforeEach(setupTestEnvironment);
    afterEach(cleanupTestEnvironment);

    it("enables content editing when the user has translate access to the content but does not have edit access", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            await wait(100); // The disabled prop is not updated immediately, so when testing for false, we need to wait a bit
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(false);
        });
    });

    it("disables content editing when the user does not have translate access to the content", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: false,
            edit: true,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables content editing when the user does not have publish access to the content", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: false,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        // mockEnglishContentDto has its publish status set to true
        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables content editing when the user does not have translate access to the selected language", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: true,
            publish: true,
        };
        accessMap.value["group-languages"].language = {
            view: true,
            translate: false,
            edit: false,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(true);
        });
    });

    it("disables post/tag settings editing when the user does not have edit access post/tag", async () => {
        accessMap.value = { ...translateAccessToAllContentMap };
        accessMap.value["group-public-content"].post = {
            view: true,
            translate: true,
            edit: false,
            publish: true,
        };

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("enables post/tag settings editing when no groups are set", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, memberOf: [] }]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(false);
        });
    });

    it("enables content editing when no groups are set", async () => {
        await db.docs.bulkPut([{ ...mockPostDto, memberOf: [] }]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.findComponent(EditContentBasic).props().disabled).toBe(false);
            expect(wrapper.findComponent(EditContentVideo).props().disabled).toBe(false);
        });
    });

    it("disables post/tag settings editing when the user does not have access to one of the groups", async () => {
        await db.docs.bulkPut([
            { ...mockPostDto, memberOf: ["group-public-content", "group-with-no-access"] },
        ]);
        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(EditContentParent).props().disabled).toBe(true);
        });
    });

    it("check if the user does not have delete access", async () => {
        delete accessMap.value["group-public-content"].post?.delete;

        const wrapper = mount(EditContent, {
            props: {
                docType: DocType.Post,
                id: mockPostDto._id,
                languageCode: "eng",
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            const deletebutton = wrapper.find('[data-test="delete-button"]');
            expect(deletebutton.exists()).toBe(false);
        });
    });

    describe("linkDates permission gate", () => {
        it("blocks saving when 'linkDates' is enabled and a sibling translation isn't synced locally", async () => {
            // Simulate a French translation that exists on the server (and is named in
            // availableTranslations, which is computed server-side without regard to the
            // acting user's access) but was never synced to this CMS instance — e.g. the
            // user has no access to lang-fra. EditContentParent's own toggle-disabling check
            // can't see this, since it only reasons about translations it has loaded.
            await db.docs.bulkPut([{ ...mockPostDto, linkDates: true }]);
            await db.docs.delete(mockFrenchContentDto._id);
            await db.docs.delete(mockSwahiliContentDto._id);
            await db.docs.put({
                ...mockEnglishContentDto,
                availableTranslations: ["lang-eng", "lang-fra"],
            } as ContentDto);

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

            const titleInput = wrapper.find('input[name="title"]');
            await titleInput.setValue("New Title");

            const saveButton = wrapper.find('[data-test="save-button"]');
            await saveButton.trigger("click");

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({
                        state: "error",
                        description:
                            "You need translate access to every translation of this content to save changes while dates are linked.",
                    }),
                );
            });

            const savedDoc = await db.get<ContentDto>(mockEnglishContentDto._id);
            expect(savedDoc?.title).toBe(mockEnglishContentDto.title);
        });

        it("allows saving when 'linkDates' is enabled and every translation is synced locally", async () => {
            await db.docs.bulkPut([{ ...mockPostDto, linkDates: true }]);
            await db.docs.bulkPut([
                {
                    ...mockEnglishContentDto,
                    availableTranslations: ["lang-eng", "lang-fra", "lang-swa"],
                },
                {
                    ...mockFrenchContentDto,
                    availableTranslations: ["lang-eng", "lang-fra", "lang-swa"],
                },
                {
                    ...mockSwahiliContentDto,
                    availableTranslations: ["lang-eng", "lang-fra", "lang-swa"],
                },
            ] as ContentDto[]);

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

            const titleInput = wrapper.find('input[name="title"]');
            await titleInput.setValue("New Title");

            const saveButton = wrapper.find('[data-test="save-button"]');
            await saveButton.trigger("click");

            await waitForExpect(() => {
                expect(notificationStore.addNotification).toHaveBeenCalledWith(
                    expect.objectContaining({ state: "success" }),
                );
            });
        });
    });
});
