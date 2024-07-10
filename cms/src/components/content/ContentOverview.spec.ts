import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "@/components/content/ContentOverview.vue";
import { db, accessMap, DocType } from "luminary-shared";
import * as mockData from "@mockdata";
import { setActivePinia } from "pinia";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import waitForExpect from "wait-for-expect";

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
