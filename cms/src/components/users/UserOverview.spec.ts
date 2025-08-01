import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import UserOverview from "./UserOverview.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import express from "express";
import { mockUserDto, superAdminAccessMap } from "@/tests/mockdata";
import { accessMap, DocType, getRest, initConfig, isConnected } from "luminary-shared";
import waitForExpect from "wait-for-expect";
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

const mockRouter = {
    push: vi.fn(), // Mock Vue Router push
};

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

// ============================
// Mock api
// ============================
const app = express();
const port = 12347;

let mockApiRequest: string;
app.get("/search", (req, res) => {
    mockApiRequest = req.headers["x-query"] as string;
    res.setHeader("Content-Type", "application/json");
    res.end(
        JSON.stringify({
            docs: [
                mockUserDto,
                { ...mockUserDto, _id: "2", name: "User 2" },
                { ...mockUserDto, _id: "3", name: "User 3" },
                { ...mockUserDto, _id: "4", name: "User 4" },
            ],
        }),
    );
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

describe("UserOverview", () => {
    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: false,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
            syncList: [{ type: DocType.User, contentOnly: true, syncPriority: 10 }],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });

        window.innerWidth = 1600; // Set a width greater than 1500px to trigger desktop view
        window.dispatchEvent(new Event("resize"));
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        isConnected.value = true; // Simulate a connected state
    });

    afterEach(() => {
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
        const wrapper = mount(UserOverview, {
            global: {
                mocks: {
                    $router: mockRouter,
                },
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create user");
        });

        await wrapper.find('[name="createUserBtn"]').trigger("click");

        await waitForExpect(() => {
            expect(mockRouter.push).toHaveBeenCalledWith({
                name: "user",
                params: { id: expect.any(String) },
            });
        });
    });

    it("can correctly query the api", async () => {
        mount(UserOverview);

        await waitForExpect(() => {
            expect(JSON.parse(mockApiRequest).types[0]).toBe(DocType.User);
        });
    });
});
