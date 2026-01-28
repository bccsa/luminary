import "fake-indexeddb/auto";
import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import CreateOrEditUser from "./CreateOrEditUser.vue";
import LDialog from "../common/LDialog.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, DocType, getRest, initConfig, isConnected } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import {
    mockGroupDtoPublicEditors,
    mockGroupDtoSuperAdmins,
    mockUserDto,
    superAdminAccessMap,
} from "@/tests/mockdata";
import express from "express";
import { nextTick, ref } from "vue";

// Mock the vue router
const routeReplaceMock = vi.fn();
const currentRouteMock = ref({ fullPath: `user/${mockUserDto._id}` });

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: vi.fn().mockImplementation(() => ({
            currentRoute: currentRouteMock,
            replace: routeReplaceMock,
        })),
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
const port = 1234;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mockApiRequest: string;
app.get("/search", (req, res) => {
    mockApiRequest = req.headers["x-query"] as string;
    res.setHeader("Content-Type", "application/json");
    res.end(
        JSON.stringify({
            docs: [mockUserDto],
        }),
    );
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

describe("CreateOrEditUser.vue", () => {
    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: false,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
            syncList: [
                { type: DocType.User, contentOnly: true, syncPriority: 10 },
                { type: DocType.Group, contentOnly: true, syncPriority: 10 },
            ],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockGroupDtoSuperAdmins, mockGroupDtoPublicEditors]);
        await nextTick();
        setActivePinia(createTestingPinia());
        isConnected.value = true; // Simulate a connected state
    });

    afterEach(async () => {
        vi.clearAllMocks();
    });

    it("should display the passed user", async () => {
        const wrapper = mount(CreateOrEditUser, {
            props: {
                id: mockUserDto._id,
                isVisible: true,
            },
        });

        await waitForExpect(() => {
            const userName = wrapper.find('[data-test="userName"]');
            const userEmail = wrapper.find('[data-test="userEmail"]');

            expect(userEmail.exists()).toBe(true);
            expect(userName.exists()).toBe(true);

            expect(userEmail.attributes("value")).toBe(mockUserDto.email);
            expect(userName.attributes("value")).toBe(mockUserDto.name);
        });
    });

    it("should update and save the current user", async () => {
        const wrapper = mount(CreateOrEditUser, {
            props: {
                id: mockUserDto._id,
                isVisible: true,
            },
        });

        // Ensure user is loaded
        await waitForExpect(() => {
            const userName = wrapper.find('[data-test="userName"]');
            expect(userName.exists()).toBe(true);
            expect(userName.attributes("value")).toBe(mockUserDto.name);
        });

        const saveButton = wrapper.findComponent(LDialog).find('[data-test="modal-primary-button"]');
        expect(saveButton.exists()).toBe(true);
        

        const userNameInput = wrapper.find(
            '[data-test="userName"]',
        ) as DOMWrapper<HTMLInputElement>;
        await userNameInput.setValue("Updated User Name");

        const userEmailInput = wrapper.find(
            '[data-test="userEmail"]',
        ) as DOMWrapper<HTMLInputElement>;
        await userEmailInput.setValue("updated@user.com");

        const groupSelector = wrapper.find('[data-test="groupSelector"]');
        const input = groupSelector.find('input[name="option-search"]');

        await input.setValue("Public Editors");
        await input.trigger("keydown.enter");

        expect(saveButton.attributes("disabled")).toBeUndefined(); // Ensure that the save button is enabled

        const saveSpy = vi.spyOn(getRest(), "changeRequest");

        await saveButton.trigger("click");
        await nextTick();

        expect(saveSpy).toHaveBeenCalled();
    });

    it("can not update the user if no group is selected", async () => {
        const wrapper = mount(CreateOrEditUser, {
            props: {
                id: mockUserDto._id,
                isVisible: true,
            },
        });

        // Ensure user is loaded
        await waitForExpect(() => {
            const userName = wrapper.find('[data-test="userName"]');
            expect(userName.exists()).toBe(true);
            expect(userName.attributes("value")).toBe(mockUserDto.name);
        });

        const saveButton = wrapper.findComponent(LDialog).find('[data-test="modal-primary-button"]');
        expect(saveButton.exists()).toBe(true);

        const userNameInput = wrapper.find(
            '[data-test="userName"]',
        ) as DOMWrapper<HTMLInputElement>;
        await userNameInput.setValue("Updated User Name");

        const userEmailInput = wrapper.find(
            '[data-test="userEmail"]',
        ) as DOMWrapper<HTMLInputElement>;
        await userEmailInput.setValue("updated@user.com");

        expect(saveButton.attributes("disabled")).toBeUndefined(); // Ensure that the save button is enabled

        const groupSelector = wrapper.find('[data-test="groupSelector"]');

        let removeBtn;
        await waitForExpect(() => {
            removeBtn = groupSelector.find('[data-test="removeTag"]');
            expect(removeBtn.exists()).toBe(true);
        });
        await removeBtn!.trigger("click");

        expect(saveButton.attributes("disabled")).toBeDefined(); // Ensure that the save button is disabled
    });

    it("can delete a user", async () => {
        const wrapper = mount(CreateOrEditUser, {
            props: {
                id: mockUserDto._id,
                isVisible: true,
            },
        });

        // Wait for the editor to be loaded
        await waitForExpect(() => {
            expect(wrapper.html()).toContain(mockUserDto.name);
        });

        let deleteButton;
        await waitForExpect(async () => {
            deleteButton = wrapper.find('[data-test="delete-button"]');
            expect(deleteButton.exists()).toBe(true);
        });
        await deleteButton!.trigger("click"); // Click the delete button

        let deleteModalButton;
        await waitForExpect(async () => {
            deleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            expect(deleteModalButton.exists()).toBe(true);
        });

        const saveSpy = vi.spyOn(getRest(), "changeRequest");

        await deleteModalButton!.trigger("click"); // Accept dialog
        await nextTick();

        expect(saveSpy).toHaveBeenCalled();
    });
});
