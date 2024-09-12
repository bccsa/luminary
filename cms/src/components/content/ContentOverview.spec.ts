import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "@/components/content/ContentOverview.vue";
import { db, accessMap, DocType } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import waitForExpect from "wait-for-expect";
import ContentTable from "./ContentTable.vue";

describe("ContentOverview.vue", () => {
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
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockData.mockEnglishContentDto.title);
        });
    });

    it("should show edit button with correct router link and icon", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

        await waitForExpect(() => {
            const editButton = wrapper.find('[data-test="edit-button"]');
            expect(editButton.exists()).toBe(true);

            const routerLink = editButton.findComponent(RouterLink);
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);

            const icon = editButton.findComponent(PencilSquareIcon);
            expect(icon.exists()).toBe(true);
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
            },
        });

        await waitForExpect(() => {
            const viewButton = wrapper.find('[data-test="edit-button"]');
            expect(viewButton.exists()).toBe(true);

            const routerLink = viewButton.findComponent(RouterLink);
            expect(routerLink.exists()).toBe(true);

            const linkProps = routerLink.props().to as RouteLocationNamedRaw;
            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.id).toBe(mockData.mockPostDto._id);

            const icon = viewButton.findComponent(EyeIcon);
            expect(icon.exists()).toBe(true);
        });
    });

    it("should display search input", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

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
            },
        });

        const searchInput = wrapper.find('[data-test="search-input"]');

        await searchInput.setValue("post 1");

        await waitForExpect(() => {
            const contentTable = wrapper.findComponent(ContentTable);

            expect(contentTable.props('queryOptions')).toMatchObject({ search: 'post 1'});
        });
    });

    it("should display sort options when sort-button is clicked", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

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

    it.only("sends correct sort options to query options", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

        const sortToggleBtn = wrapper.find('[data-test="sort-toggle-btn"]');
        await sortToggleBtn.trigger("click");

        const sortOptionTitle = wrapper.find('[data-test="sort-option-title"]');
        const sortOptionExpiryDate = wrapper.find('[data-test="sort-option-expiry-date"]');
        const sortOptionPublishDate = wrapper.find('[data-test="sort-option-publish-date"]');
        const sortOptionLastUpdated = wrapper.find('[data-test="sort-option-last-updated"]');

        await waitForExpect(async () => {
            const contentTable = wrapper.findComponent(ContentTable);

            await sortOptionTitle.trigger("input");
            expect(contentTable.props('queryOptions')).toMatchObject({ orderBy: 'title' });

            await sortOptionExpiryDate.trigger("input");
            expect(contentTable.props('queryOptions')).toMatchObject({ orderBy: 'expiryDate' });

            await sortOptionPublishDate.trigger("input");
            expect(contentTable.props('queryOptions')).toMatchObject({ orderBy: 'publishDate' });

            await sortOptionLastUpdated.trigger("input");
            expect(contentTable.props('queryOptions')).toMatchObject({ orderBy: 'updatedTimeUtc' });
        });
    });

    it("can create content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

        await waitForExpect(() => {
            const createButton = wrapper.find('[data-test="create-button"]');
            expect(createButton.text()).toBe("Create post");

            const routerLink = createButton.findComponent(RouterLink);
            const linkProps = routerLink.props().to as RouteLocationNamedRaw;

            expect(linkProps.name).toBe("edit");
            expect(linkProps.params?.docType).toBe("post");
            expect(linkProps.params?.tagType).toBe("default");
            expect(linkProps.params?.id).toBe("new");
        });
    });

    it("should handle language switching correctly", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
            },
        });

        await waitForExpect(async () => {
            const languageSelect = wrapper.findComponent({ name: "LSelect" });

            // Switch to French
            await languageSelect.vm.$emit("update:modelValue", mockData.mockFrenchContentDto._id);

            // Mocked French content should be displayed
            expect(wrapper.html().includes(mockData.mockFrenchContentDto.title)).toBeTruthy();
        });
    });
});
