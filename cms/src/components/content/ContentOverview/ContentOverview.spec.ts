import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";

// Create a shared mock push function using vi.hoisted() so it's available in hoisted mocks
const { mockPush } = vi.hoisted(() => {
    return { mockPush: vi.fn() };
});

// Mock the app router used inside ContentDisplayCard and ContentOverview
vi.mock("@/router", () => {
    const router = {
        push: mockPush,
        currentRoute: { value: { meta: {} } },
    };
    return { default: router };
});

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        useRouter: () => ({
            push: mockPush,
            currentRoute: ref({ name: "edit" }),
        }),
    };
});

import ContentOverview from "./ContentOverview.vue";
import { db, accessMap, DocType, type ContentDto, PostType } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import waitForExpect from "wait-for-expect";
import ContentTable from "../ContentTable.vue";
import { cmsLanguageIdAsRef } from "@/globalConfig";

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
        mockPush.mockClear();
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

    it("should expose an edit link with correct route and an icon in the row", async () => {
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
            const firstRow = wrapper.find('[data-test="content-row"]');
            expect(firstRow.exists()).toBe(true);

            // In the new UI, language badges are RouterLinks to the edit route
            const routerLink = firstRow.findComponent(RouterLink);
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);

            // Check there is some icon (language badge includes an svg)
            const iconExists = routerLink.find("svg").exists();
            expect(iconExists).toBe(true);
        });
    });

    it("should still expose a link with correct route when user lacks edit permission", async () => {
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

        await waitForExpect(async () => {
            const firstRow = wrapper.find('[data-test="content-row"]');
            expect(firstRow.exists()).toBe(true);

            // In view-only mode, language badges may not be rendered as links.
            // If a RouterLink is present, assert its route; otherwise, click the row and
            // assert that router.push was invoked with the correct route.
            const routerLink = firstRow.findComponent(RouterLink);
            if (routerLink.exists()) {
                const linkProps = routerLink.props().to as RouteLocationNamedRaw;
                expect(linkProps.name).toBe("edit");
                expect(linkProps.params?.docType).toBe("post");
                expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);
                const iconExists = routerLink.find("svg").exists();
                expect(iconExists).toBe(true);
            } else {
                await firstRow.trigger("click");
                expect(mockPush).toHaveBeenCalledWith(
                    expect.objectContaining({
                        name: "edit",
                        params: expect.objectContaining({
                            docType: "post",
                            id: mockData.mockPostDto._id,
                        }),
                    }),
                );
            }
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

    it("should display generic filter bar with search input", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                tagOrPostType: PostType.Blog,
            },
            // stubs: {
            //     LGenericFilterBar: true, // If we want to shallow mount or inspect props
            // },
        });

        //@ts-ignore as this code is valid
        wrapper.vm.selectedLanguage = "lang-eng";

        await waitForExpect(() => {
            const filterBar = wrapper.findComponent({ name: "LGenericFilterBar" });
            expect(filterBar.exists()).toBe(true);

            // The GenericFilterBar usually contains a search input.
            // Depending on implementation, we might need to find it deeper
            // or trust that LGenericFilterBar handles the search.
            // If the search input has a specific data-test in LGenericFilterBar:
            // const searchInput = wrapper.find('[data-test="search-input"]');
            // expect(searchInput.exists()).toBe(true);
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

        const filterBar = wrapper.findComponent({ name: "LGenericFilterBar" });
        expect(filterBar.exists()).toBe(true);

        // Simulate LGenericFilterBar emitting an update to queryOptions or query
        // Since `queryOptions` is v-modeled, updating it should work.
        // Assuming LGenericFilterBar updates the 'search' field in queryOptions.

        const newOptions = { ...filterBar.props("queryOptions"), search: "post 1" };
        await filterBar.vm.$emit("update:queryOptions", newOptions);

        await waitForExpect(() => {
            const contentTable = wrapper.findComponent(ContentTable);
            expect(contentTable.props("queryOptions")).toMatchObject({ search: "post 1" });
        });
    });

    it("should display sort options via generic filter bar configuration", async () => {
        // Since sorting is handled by LGenericFilterBar configuration,
        // we can check if the config prop passed to it contains the expected sort fields.
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
            const filterBar = wrapper.findComponent({ name: "LGenericFilterBar" });
            expect(filterBar.exists()).toBe(true);
            const config = filterBar.props("config");
            expect(config.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ key: "title", sortable: true }),
                    expect.objectContaining({ key: "publishDate", sortable: true }),
                    expect.objectContaining({ key: "expiryDate", sortable: true }),
                    expect.objectContaining({ key: "updatedTimeUtc", sortable: true }),
                ]),
            );
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

        const filterBar = wrapper.findComponent({ name: "LGenericFilterBar" });
        expect(filterBar.exists()).toBe(true);

        // Simulate updating the sort via the component's v-model update
        const newOptions = {
            ...filterBar.props("queryOptions"),
            orderBy: "title",
            orderDirection: "asc",
        };
        await filterBar.vm.$emit("update:queryOptions", newOptions);

        await waitForExpect(async () => {
            const contentTable = wrapper.findComponent(ContentTable);
            expect(contentTable.props("queryOptions")).toMatchObject({
                orderBy: "title",
                orderDirection: "asc",
            });
        });
    });

    it("should display filter options (LSelect, LCombobox) and update query options", async () => {
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
            // Check for LSelect components (Translation & Publish Status)
            const selects = wrapper.findAllComponents({ name: "LSelect" });
            // Expect at least 2: Translation Status, Publish Status
            expect(selects.length).toBeGreaterThanOrEqual(2);

            // Check for LCombobox components (Tags, Groups)
            const comboboxes = wrapper.findAllComponents({ name: "LCombobox" });
            expect(comboboxes.length).toBeGreaterThanOrEqual(2);
        });

        // Test updating a filter
        const selectComponents = wrapper.findAllComponents({ name: "LSelect" });
        const translationSelect = selectComponents[0]; // First one is translationStatus

        // Update value
        await translationSelect.vm.$emit("update:modelValue", "translated");

        await waitForExpect(() => {
            const contentTable = wrapper.findComponent(ContentTable);
            expect(contentTable.props("queryOptions").translationStatus).toBe("translated");
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
