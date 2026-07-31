import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import UserOverview from "./UserOverview.vue";
import UserDisplayCard from "./UserDisplayCard.vue";
import CreateOrEditUser from "./CreateOrEditUser.vue";
import LCombobox from "../forms/LCombobox.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import express from "express";
import * as restModule from "luminary-shared";
import { mockGroupDtoSuperAdmins, mockUserDto, superAdminAccessMap } from "@/tests/mockdata";
import {
    accessMap,
    DocType,
    getRest,
    initConfig,
    initHybridQuery,
    HttpReq,
    isConnected,
    db,
} from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { ref } from "vue";
import LDialog from "../common/LDialog.vue";

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

// Capture every IntersectionObserver callback the page registers (browse sentinel + search
// sentinel), so a test can simulate a sentinel scrolling into view. `vi.hoisted` because
// `vi.mock` factories run before the module body initialises its consts.
const { observerCallbacks } = vi.hoisted(() => ({
    observerCallbacks: [] as Array<(entries: Partial<IntersectionObserverEntry>[]) => void>,
}));

vi.mock("@vueuse/core", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@vueuse/core")>();
    const { ref: vueRef } = await import("vue");
    return {
        ...actual,
        useIntersectionObserver: (_target: unknown, callback: unknown) => {
            observerCallbacks.push(callback as (typeof observerCallbacks)[number]);
            return {
                isSupported: vueRef(true),
                isActive: vueRef(true),
                pause: vi.fn(),
                resume: vi.fn(),
                stop: vi.fn(),
            };
        },
    };
});

/** Fire every registered sentinel. Guards inside each composable ignore the irrelevant ones. */
const scrollSentinelsIntoView = () =>
    observerCallbacks.forEach((cb) => cb([{ isIntersecting: true }]));

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());
// ============================
// Mock api
// ============================
const app = express();
app.use(express.json());
const port = 12347;

let mockQuerySelector: { type?: string } | undefined;
const defaultMockUsers = [
    mockUserDto,
    { ...mockUserDto, _id: "2", name: "User 2" },
    { ...mockUserDto, _id: "3", name: "User 3" },
    { ...mockUserDto, _id: "4", name: "User 4" },
];
let mockUsers = defaultMockUsers;

// User is non-synced → served API-only via HybridQuery, which POSTs to /query.
app.post("/query", (req, res) => {
    mockQuerySelector = req.body?.selector;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ docs: mockUsers }));
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

describe("UserOverview", () => {
    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: true,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });
        // Wire HybridQuery's HTTP transport so the API-only User query can POST /query.
        initHybridQuery(new HttpReq(`http://localhost:${port}`));

        window.innerWidth = 1600; // Set a width greater than 1500px to trigger desktop view
        window.dispatchEvent(new Event("resize"));
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        await db.bulkPut([mockGroupDtoSuperAdmins]);
        await db.localChanges.clear();
        isConnected.value = true; // Simulate a connected state
    });

    afterEach(async () => {
        await db.docs.clear();
        await db.localChanges.clear();
        mockUsers = defaultMockUsers;
        observerCallbacks.length = 0;
        vi.clearAllMocks();
    });

    it("displays all users", async () => {
        const wrapper = mount(UserOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("John Doe");
            expect(wrapper.text()).toContain("User 2");
            expect(wrapper.text()).toContain("User 3");
            expect(wrapper.text()).toContain("User 4");
        });
    });

    it("can create a new user", async () => {
        const wrapper = mount(UserOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create user");
            expect(wrapper.text()).toContain("John Doe");
        });

        await wrapper.find('[name="createUserBtn"]').trigger("click");

        const editUserComp = wrapper.findComponent(CreateOrEditUser);

        await waitForExpect(() => {
            expect(editUserComp.exists()).toBe(true);
        });

        await waitForExpect(() => {
            const LComboComp = editUserComp.findComponent(LCombobox);
            expect(LComboComp.exists()).toBe(true);
        });

        const groupMemberInput = editUserComp
            .findComponent(LCombobox)
            .find('[name="option-search"]');

        await waitForExpect(() => {
            expect(groupMemberInput.exists()).toBe(true);
        });

        await groupMemberInput.setValue("Super Admins");
        await groupMemberInput.trigger("keydown.enter");

        await waitForExpect(() => {
            const tags = editUserComp.findAll('[data-test="selected-tag"]');
            expect(tags.length).toBe(1);
            expect(tags[0].text()).toBe("Super Admins");
        });

        const emailInput = editUserComp.find('[name="userEmail"]');
        await waitForExpect(() => {
            expect(emailInput.exists()).toBe(true);
        });

        const nameInput = editUserComp.find('[name="userName"]');
        await waitForExpect(() => {
            expect(nameInput.exists()).toBe(true);
        });

        await emailInput.setValue("test@example.com");

        await nameInput.setValue("New Test User");

        let saveButton;
        await waitForExpect(() => {
            saveButton = editUserComp
                .findComponent(LDialog)
                .find('[data-test="modal-primary-button"]');
            expect(saveButton.exists()).toBe(true);
        });

        const originalChangeRequest = restModule.getRest().changeRequest;
        let changeRequestCalled = false;
        let changeRequestCallArgs: any = null;

        restModule.getRest().changeRequest = vi.fn(async (args) => {
            changeRequestCalled = true;
            changeRequestCallArgs = args;
            return { ack: "Accepted" };
        });

        try {
            await saveButton!.trigger("click");

            await waitForExpect(() => {
                expect(changeRequestCalled).toBe(true);
                expect(changeRequestCallArgs).toEqual(
                    expect.objectContaining({
                        doc: expect.objectContaining({
                            email: "test@example.com",
                            name: "New Test User",
                        }),
                    }),
                );
            });
        } finally {
            restModule.getRest().changeRequest = originalChangeRequest;
        }
    });

    it("can correctly query the api", async () => {
        mount(UserOverview);

        await waitForExpect(() => {
            expect(mockQuerySelector?.type).toBe(DocType.User);
        });
    });

    it("hides create button when user lacks permissions", async () => {
        accessMap.value = {};
        const wrapper = mount(UserOverview);

        await wrapper.vm.$nextTick();
        expect(wrapper.find('[name="createUserBtn"]').exists()).toBe(false);

        // Restore for other tests
        accessMap.value = superAdminAccessMap;
    });

    it("shows create button when user has permissions", async () => {
        const wrapper = mount(UserOverview);

        await waitForExpect(() => {
            expect(wrapper.find('[name="createUserBtn"]').exists()).toBe(true);
        });
    });

    it("lists users without a paginator", async () => {
        const wrapper = mount(UserOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("John Doe");
        });

        expect(wrapper.findComponent({ name: "LPaginator" }).exists()).toBe(false);
    });

    // Regression for #1797. The browse window used to be driven by an inject of BasePage's
    // scroll container — but UserOverview *renders* BasePage, so the inject resolved to its
    // fallback and the window never grew past the first page.
    describe("browse infinite scroll", () => {
        const manyUsers = Array.from({ length: 25 }, (_, i) => ({
            ...mockUserDto,
            _id: `user-${i}`,
            name: `User ${i}`,
        }));

        it("renders a sentinel and grows the window when it scrolls into view", async () => {
            mockUsers = manyUsers;
            const wrapper = mount(UserOverview);

            await waitForExpect(() => {
                expect(wrapper.findAllComponents(UserDisplayCard).length).toBe(20);
            });

            // The browse sentinel must be registered for the window to ever grow.
            expect(observerCallbacks.length).toBeGreaterThan(0);

            scrollSentinelsIntoView();
            await wrapper.vm.$nextTick();

            expect(wrapper.findAllComponents(UserDisplayCard).length).toBe(25);
        });

        it("stops growing once every user is visible", async () => {
            mockUsers = manyUsers;
            const wrapper = mount(UserOverview);

            await waitForExpect(() => {
                expect(wrapper.findAllComponents(UserDisplayCard).length).toBe(20);
            });

            scrollSentinelsIntoView();
            await wrapper.vm.$nextTick();
            scrollSentinelsIntoView(); // no-op — hasMore is false
            await wrapper.vm.$nextTick();

            expect(wrapper.findAllComponents(UserDisplayCard).length).toBe(25);
        });
    });
});
