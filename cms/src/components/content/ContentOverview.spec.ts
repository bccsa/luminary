import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "@/components/content/ContentOverview.vue";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockPostDto,
    viewAccessToAllContentMap,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { DocType } from "@/types";
import { ref } from "vue";
import { DateTime } from "luxon";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";

describe("ContentOverview.vue", () => {
    beforeAll(async () => {
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                whereTypeAsRef: vi.fn((docType) => {
                    if (docType === "post") {
                        return ref([mockPostDto]);
                    } else if (docType === "language") {
                        return ref([mockLanguageDtoEng]);
                    }

                    return ref([]);
                }),
                whereParentAsRef: vi.fn(() => {
                    return ref([mockEnglishContentDto]);
                }),
                isLocalChange: vi.fn(() => {
                    return false;
                }),
                toDateTime: vi.fn((val) => {
                    return DateTime.fromMillis(val);
                }),
            },
        }));

        setActivePinia(createTestingPinia());

        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("should display content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });

        expect(wrapper.html().includes(mockEnglishContentDto.title)).toBeTruthy();
    });

    it("should show edit button with correct router link and icon", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });

        await wrapper.vm.$nextTick();

        const editButton = wrapper.find('[data-test="edit-button"]');
        expect(editButton.exists()).toBe(true);

        const routerLink = editButton.findComponent(RouterLink);
        expect(routerLink.exists()).toBe(true);

        const linkProps = routerLink.props().to as RouteLocationNamedRaw;
        expect(linkProps.name).toBe("posts.edit");
        expect(linkProps.params?.id).toBe(mockPostDto._id);

        const icon = editButton.findComponent(PencilSquareIcon);
        expect(icon.exists()).toBe(true);
    });

    it("should show view icon with correct router link if no edit permission", async () => {
        const userAccessStore = useUserAccessStore();
        userAccessStore.accessMap = viewAccessToAllContentMap;

        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });
        await wrapper.vm.$nextTick();

        const viewButton = wrapper.find('[data-test="edit-button"]');
        expect(viewButton.exists()).toBe(true);

        const routerLink = viewButton.findComponent(RouterLink);
        expect(routerLink.exists()).toBe(true);

        const linkProps = routerLink.props().to as RouteLocationNamedRaw;
        console.log("View button linkProps:", linkProps);

        expect(linkProps.name).toBe("posts.edit");
        expect(linkProps.params?.id).toBe(mockPostDto._id);

        const icon = viewButton.findComponent(EyeIcon);
        expect(icon.exists()).toBe(true);
    });

    it("can create content", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },

            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });

        await wrapper.vm.$nextTick();

        const createButton = wrapper.find('[data-test="create-button"]');
        expect(createButton.exists()).toBe(true);
        expect(createButton.text()).toBe("Create Post");

        const routerLink = createButton.findComponent(RouterLink);
        expect(routerLink.exists()).toBe(true);

        const linkProps = routerLink.props().to as RouteLocationNamedRaw;
        expect(linkProps.name).toBe("posts.create");
        expect(linkProps.params?.id).toBe(undefined);
    });

    it("should handle language switching correctly", async () => {
        const wrapper = mount(ContentOverview, {
            global: {
                plugins: [createTestingPinia()],
            },
            props: {
                docType: DocType.Post,
                titleSingular: "Post",
                titlePlural: "Posts",
            },
        });

        await wrapper.vm.$nextTick();

        const languageSelect = wrapper.findComponent({ name: "LSelect" });
        expect(languageSelect.exists()).toBe(true);

        // Switch to French
        await languageSelect.vm.$emit("update:modelValue", mockFrenchContentDto._id);
        await wrapper.vm.$nextTick();

        // Mocked French content should be displayed
        expect(wrapper.html().includes(mockFrenchContentDto.title)).toBeTruthy();
    });
});
