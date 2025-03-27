import "fake-indexeddb/auto";
import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import EditUser from "./EditUser.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, DocType, getRest, initConfig, type UserDto } from "luminary-shared";
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
import LCombobox from "../forms/LCombobox.vue";

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

// ============================
// Mock api
// ============================
const app = express();
const port = 12348;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mockApiRequest: string;
app.get("/search", (req, res) => {
    mockApiRequest = req.headers["x-query"] as string;
    res.setHeader("Content-Type", "application/json");
    res.end(
        JSON.stringify({
            docs: [mockUserDto, mockGroupDtoSuperAdmins],
        }),
    );
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

describe("EditUser.vue", () => {
    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: false,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
            docTypes: [
                { type: DocType.User, contentOnly: true, syncPriority: 10 },
                { type: DocType.Group, contentOnly: true, syncPriority: 10 },
            ],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });
    });

    beforeEach(async () => {
        await db.docs.bulkPut([mockGroupDtoSuperAdmins, mockUserDto, mockGroupDtoPublicEditors]);
        await nextTick();
        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("should display the passed user", async () => {
        const wrapper = mount(EditUser, {
            props: {
                id: mockUserDto._id,
            },
        });

        const currentLanguage = wrapper.findAll("input");

        await waitForExpect(async () => {
            expect(currentLanguage[0].element.value).toBe(mockUserDto.name);
            expect(currentLanguage[1].element.value).toBe(mockUserDto.email);
        });
    });

    it("should update and save the current user", async () => {
        const wrapper = mount(EditUser, {
            props: {
                id: mockUserDto._id,
            },
        });
        // Ensure user is loaded
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockUserDto.name);
        });
        const saveButton = wrapper.find('[data-test="save-button"]');

        await nextTick(); // Ensure Vue updates the UI before proceeding

        const userNameInput = wrapper.find(
            '[data-test="userName"]',
        ) as DOMWrapper<HTMLInputElement>;
        userNameInput.setValue("Updated User Name");

        const userEmailInput = wrapper.find(
            '[data-test="userEmail"]',
        ) as DOMWrapper<HTMLInputElement>;
        userEmailInput.setValue("updated@user.com");

        const groupSelector = wrapper.find('[data-test="groupSelector"]');
        const input = groupSelector.find('input[name="option-search"]');

        await input.setValue("Public Editors");
        await input.trigger("keydown.enter");

        console.log(saveButton.attributes());

        await nextTick(); // Ensure Vue updates the UI before proceeding

        await saveButton.trigger("click");

        await waitForExpect(async () => {
            const localChangesTable = await db.localChanges.toArray();

            const updatedUser = localChangesTable.find((c) => c.doc!._id === mockUserDto._id)!
                .doc as UserDto;

            expect(updatedUser.name).toBe("Updated User Name");
            expect(updatedUser.email).toBe("updated@user.com");
        });
    });

    it("cant update the user if no group is selected", async () => {
        const wrapper = mount(EditUser, {
            props: {
                id: mockUserDto._id,
            },
        });

        // Ensure user is loaded
        await waitForExpect(() => {
            expect(wrapper.text()).toContain(mockUserDto.name);
        });

        const saveButton = wrapper.find('[data-test="save-button"]');

        const userNameInput = wrapper.find(
            '[data-test="userName"]',
        ) as DOMWrapper<HTMLInputElement>;
        userNameInput.setValue("Updated User Name");

        const userEmailInput = wrapper.find(
            '[data-test="userEmail"]',
        ) as DOMWrapper<HTMLInputElement>;
        userEmailInput.setValue("updated@user.com");

        // remove selected tag
        await wrapper.find('[data-test="removeTag"]').trigger("click");

        expect(saveButton.attributes("disabled")).toBeDefined();
        expect(wrapper.html()).toContain("No group selected");
    });

    it("can delete a user", async () => {
        const wrapper = mount(EditUser, {
            props: {
                id: mockUserDto._id,
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
        await deleteModalButton!.trigger("click"); // Accept dialog

        await waitForExpect(async () => {
            const localChangesTable = await db.localChanges.toArray();

            const deletedUser = localChangesTable.find((c) => c.doc?._id === mockUserDto._id)
                ?.doc as UserDto;

            expect(deletedUser.deleteReq).toBeDefined();
            expect(deletedUser.deleteReq).toBe(1);
        });
    });
});
