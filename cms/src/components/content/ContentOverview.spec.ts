import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import ContentOverview from "@/components/content/ContentOverview.vue";
import {
    fullAccessToAllContentMap,
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { useUserAccessStore } from "@/stores/userAccess";
import { AclPermission, DocType } from "@/types";
import { ref } from "vue";
import { DateTime } from "luxon";
import { RouterLink, type RouteLocationNamedRaw } from "vue-router";
import router from "@/router";

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

    it("should show edit button with correct router link", async () => {
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
    });

    it.skip("should show view button with correct router link", async () => {});
});
