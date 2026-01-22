import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import UserOverview from "./UserOverview.vue";
import EditUser from "./EditUser.vue";
import LCombobox from "../forms/LCombobox.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import express from "express";
import * as restModule from "luminary-shared";
import { mockGroupDtoSuperAdmins, mockUserDto, superAdminAccessMap } from "@/tests/mockdata";
import { accessMap, DocType, getRest, initConfig, isConnected, db } from "luminary-shared";
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
            syncList: [{ type: DocType.User, contentOnly: true, syncPriority: 10 }, { type: DocType.Group, contentOnly: true, syncPriority: 20 }],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });

        window.innerWidth = 1600; // Set a width greater than 1500px to trigger desktop view
        window.dispatchEvent(new Event("resize"));
    });

    beforeEach(async () => {
        setActivePinia(createTestingPinia());
        await db.bulkPut([mockGroupDtoSuperAdmins])
        await db.localChanges.clear();
        isConnected.value = true; // Simulate a connected state
    });

    afterEach(async () => {
        await db.docs.clear()
        await db.localChanges.clear()
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
        });

        await wrapper.find('[name="createUserBtn"]').trigger("click");

        const editUserComp = wrapper.findComponent(EditUser)

        await waitForExpect(() => {
            expect(editUserComp.exists()).toBe(true);
        });

        await waitForExpect(() => {
        const LComboComp = editUserComp.findComponent(LCombobox);
        expect(LComboComp.exists()).toBe(true);
        });

        const groupMemberInput = editUserComp.findComponent(LCombobox).find('[name="option-search"]');

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

        await emailInput.setValue("test@example.com");
        await emailInput.trigger("change");


        let saveButton;
        await waitForExpect(() => {
        saveButton = editUserComp.findComponent(LDialog).find('[data-test="modal-primary-button"]');
        expect(saveButton.exists()).toBe(true);
        });
        
        const saveSpy = vi.spyOn(restModule.getRest(), 'changeRequest')
        .mockResolvedValue({ ack: 'Accepted' });
        
        await saveButton!.trigger("click");

        await waitForExpect(() => {
            expect(saveSpy).toHaveBeenCalled();
            expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
        });
    });

    it("can correctly query the api", async () => {
        mount(UserOverview);

        await waitForExpect(() => {
            expect(JSON.parse(mockApiRequest).types[0]).toBe(DocType.User);
        });
    });
});
