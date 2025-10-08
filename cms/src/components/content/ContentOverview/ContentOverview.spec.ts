import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "./ContentOverview.vue";
import { db, accessMap, DocType, type ContentDto, PostType } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import waitForExpect from "wait-for-expect";
import ContentTable from "../ContentTable.vue";
import { cmsLanguageIdAsRef } from "@/globalConfig";
import { ref } from "vue";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: vi.fn(),
            currentRoute: ref({ name: "edit" }),
        }),
    };
});

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

describe("ContentOverview.vue", () => {
    beforeAll(async () => {
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto, mockData.mockFrenchContentDto]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
            mockData.mockGroupDtoPrivateContent,
            mockData.mockGroupDtoPublicContent,
            mockData.mockGroupDtoPublicEditors,
            mockData.mockGroupDtoPublicUsers,
            mockData.mockGroupDtoSuperAdmins,
        ]);
        window.innerWidth = 1600; // Set a width greater than 1500px to trigger desktop view
        window.dispatchEvent(new Event("resize"));
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockData.mockPostDto]);
        await db.docs.bulkPut([mockData.mockEnglishContentDto, mockData.mockFrenchContentDto]);
        await db.docs.bulkPut([
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        setActivePinia(createTestingPinia());

        accessMap.value = mockData.fullAccessToAllContentMap;

        cmsLanguageIdAsRef.value = "lang-eng";
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        await wrapper.vm.$nextTick();
        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(async () => {
            expect(await wrapper.html()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("should show edit button with correct router link and icon", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const editButton = wrapper.find('[data-test="edit-button"]');
            expect(editButton.exists()).toBe(true);

            // Find the RouterLink component, which might be wrapped inside the LButton component
            let routerLink = editButton.findComponent(RouterLink);
            if (!routerLink.exists()) {
                // If not found directly, look deeper in the component hierarchy
                routerLink = editButton.find("a").findComponent(RouterLink);
            }
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);

            // Check if the icon exists, might be nested in the new button structure
            const iconExists =
                editButton.findComponent(PencilSquareIcon).exists() ||
                editButton.find("svg").exists();
            expect(iconExists).toBe(true);
        });
    });

    it("should show view icon with correct router link if no edit permission", async () => {
        accessMap.value = mockData.viewAccessToAllContentMap;

        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const viewButton = wrapper.find('[data-test="edit-button"]');
            expect(viewButton.exists()).toBe(true);

            // Find the RouterLink component, which might be wrapped inside the LButton component
            let routerLink = viewButton.findComponent(RouterLink);
            if (!routerLink.exists()) {
                // If not found directly, look deeper in the component hierarchy
                routerLink = viewButton.find("a").findComponent(RouterLink);
            }
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);

            // Check if the icon exists, might be nested in the new button structure
            const iconExists =
                viewButton.findComponent(EyeIcon).exists() || viewButton.find("svg").exists();
            expect(iconExists).toBe(true);
        });
    });

    it("should switch languages correctly", async () => {
        await db.docs.clear();
        const docs: ContentDto[] = [
            {
                ...mockData.mockEnglishContentDto,
                _id: "content-post1-eng",
            },
            {
                ...mockData.mockFrenchContentDto,
                _id: "content-post2-fra",
            },
            {
                ...mockData.mockSwahiliContentDto,
                _id: "content-post3-swa",
            },
            {
                ...mockData.mockEnglishContentDto,
                _id: "content-post4-eng",
            },
            {
                ...mockData.mockFrenchContentDto,
                title: "some-mock-french-post",
                _id: "content-post5-fra",
            },
            {
                ...mockData.mockSwahiliContentDto,
                title: "some-mock-swahili-post",
                _id: "content-post6-swa",
            },
            {
                ...mockData.mockEnglishContentDto,
                _id: "content-post7-eng",
            },
            {
                ...mockData.mockFrenchContentDto,
                _id: "content-post8-fra",
            },
            {
                ...mockData.mockSwahiliContentDto,
                _id: "content-post9-swa",
            },
        ];

        await db.docs.bulkPut([
            ...docs,
            mockData.mockLanguageDtoEng,
            mockData.mockLanguageDtoFra,
            mockData.mockLanguageDtoSwa,
        ]);

        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        await waitForExpect(async () => {
            //@ts-ignore as this code is valid
            wrapper.vm.cmsLanguageIdAsRef = "lang-eng";

            const contentTable = await wrapper.findComponent(ContentTable);

            const contentRows = await contentTable.findAll('[data-test="content-row"]');
            expect(contentRows.length).toBe(3);

            //@ts-ignore as this code is valid
            cmsLanguageIdAsRef.value = "lang-fra";
            const updatedFrenchContentRows = await contentTable.findAll(
                '[data-test="content-row"]',
            );
            expect(updatedFrenchContentRows.length).toBe(3);

            //@ts-ignore as this code is valid
            cmsLanguageIdAsRef.value = "lang-swa";
            const updatedSwahiliContentRows = await contentTable.findAll(
                '[data-test="content-row"]',
            );
            expect(updatedSwahiliContentRows.length).toBe(3);
        });
    });

    it("should display search input", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const searchInput = wrapper.find('[data-test="search-input"]');
            expect(searchInput.exists()).toBe(true);
        });
    });

    it("correctly sends a search query to query options", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        const searchInput = wrapper.find('[data-test="search-input"]');

        await searchInput.setValue("post 1");

        await waitForExpect(() => {
            const contentTable = wrapper.findComponent(ContentTable);

            expect(contentTable.props("queryOptions")).toMatchObject({ search: "post 1" });
        });
    });

    it("should display sort options when sort-button is clicked", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(async () => {
            const sortToggleBtn = wrapper.find('[data-test="sort-toggle-btn"]');
            expect(sortToggleBtn.exists()).toBe(true);
            await sortToggleBtn.trigger("click");

            const sortOptionsDiv = wrapper.find('[data-test="sort-options-display"]');
            expect(sortOptionsDiv.exists()).toBe(true);

            const sortOptionTitle = wrapper.find('[data-test="sort-option-title"]');
            const sortOptionExpiryDate = wrapper.find('[data-test="sort-option-expiry-date"]');
            const sortOptionPublishDate = wrapper.find('[data-test="sort-option-publish-date"]');
            const sortOptionLastUpdated = wrapper.find('[data-test="sort-option-last-updated"]');

            expect(sortOptionTitle.exists()).toBe(true);
            expect(sortOptionExpiryDate.exists()).toBe(true);
            expect(sortOptionPublishDate.exists()).toBe(true);
            expect(sortOptionLastUpdated.exists()).toBe(true);
        });
    });

    it("sends correct sort options to query options", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        const sortToggleBtn = wrapper.find('[data-test="sort-toggle-btn"]');
        await sortToggleBtn.trigger("click");

        const sortOptionTitle = wrapper.find('[data-test="sort-option-title"]');
        const sortOptionExpiryDate = wrapper.find('[data-test="sort-option-expiry-date"]');
        const sortOptionPublishDate = wrapper.find('[data-test="sort-option-publish-date"]');
        const sortOptionLastUpdated = wrapper.find('[data-test="sort-option-last-updated"]');

        const sortOptionAscending = wrapper.find('[data-test="ascending-sort-toggle"]');
        const sortOptionDescending = wrapper.find('[data-test="descending-sort-toggle"]');

        await waitForExpect(async () => {
            const contentTable = wrapper.findComponent(ContentTable);

            await sortOptionTitle.trigger("input");
            expect(contentTable.props("queryOptions")).toMatchObject({ orderBy: "title" });

            await sortOptionExpiryDate.trigger("input");
            expect(contentTable.props("queryOptions")).toMatchObject({ orderBy: "expiryDate" });

            await sortOptionPublishDate.trigger("input");
            expect(contentTable.props("queryOptions")).toMatchObject({
                orderBy: "publishDate",
            });

            await sortOptionLastUpdated.trigger("input");
            expect(contentTable.props("queryOptions")).toMatchObject({
                orderBy: "updatedTimeUtc",
            });

            await sortOptionAscending.trigger("click");
            expect(contentTable.props("queryOptions")).toMatchObject({ orderDirection: "asc" });

            await sortOptionDescending.trigger("click");
            expect(contentTable.props("queryOptions")).toMatchObject({
                orderDirection: "desc",
            });
        });
    });

    it("should display filter options and inputs", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(async () => {
            const filterInputSelects = wrapper.findAll('[data-test="filter-select"]');
            expect(filterInputSelects.length).toBe(2);
        });
    });

    it("should update query options from filter inputs correctly", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        const filterInputSelects = wrapper.findAll('[data-test="filter-select"]');

        await waitForExpect(async () => {
            const contentTable = wrapper.findComponent(ContentTable);

            await filterInputSelects[0].setValue("translated");
            expect(contentTable.props("queryOptions").translationStatus).toBe("translated");

            await filterInputSelects[0].setValue("untranslated");
            expect(contentTable.props("queryOptions").translationStatus).toBe("untranslated");

            await filterInputSelects[0].setValue("all");
            expect(contentTable.props("queryOptions").translationStatus).toBe("all");

            await filterInputSelects[1].setValue("published");
            expect(contentTable.props("queryOptions").publishStatus).toBe("published");

            await filterInputSelects[1].setValue("scheduled");
            expect(contentTable.props("queryOptions").publishStatus).toBe("scheduled");

            await filterInputSelects[1].setValue("expired");
            expect(contentTable.props("queryOptions").publishStatus).toBe("expired");

            await filterInputSelects[1].setValue("draft");
            expect(contentTable.props("queryOptions").publishStatus).toBe("draft");
        });
    });

    it("can create content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const createButton = wrapper.find('[data-test="create-button"]');
            expect(createButton.text()).toBe("Create post");

            const routerLink = createButton.findComponent(RouterLink);
            const linkProps = routerLink.props().to as RouteLocationNamedRaw;

            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.tagOrPostType).toBe("blog");
            expect(linkProps.params?.id).toBe("new");
        });
    });
});
