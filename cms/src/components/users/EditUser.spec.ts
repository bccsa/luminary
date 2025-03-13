import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from "vitest";
import EditUser from "./EditUser.vue";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db, DocType, getRest, initConfig, type UserDto } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import { setActivePinia } from "pinia";
import { mockGroupDtoSuperAdmins, mockUserDto, superAdminAccessMap } from "@/tests/mockdata";
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
        await db.docs.bulkPut([mockGroupDtoSuperAdmins, mockUserDto]);
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

        // @ts-expect-error
        wrapper.vm.editable.name = "Updated User Name";

        // @ts-expect-error
        wrapper.vm.editable.email = "updated@user.com";

        await nextTick(); // Ensure Vue updates the UI before proceeding

        await saveButton.trigger("click");

        await waitForExpect(async () => {
            const updatedUser = (await db.docs.get({ _id: mockUserDto._id })) as UserDto;

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

        await nextTick(); // Ensure Vue updates the UI before proceeding

        // @ts-expect-error
        wrapper.vm.editable.name = "Updated User Name";

        // @ts-expect-error
        wrapper.vm.editable.email = "updated@user.com";

        // @ts-expect-error
        wrapper.vm.editable.memberOf = [];

        await nextTick(); // Ensure Vue updates the UI before proceeding

        await saveButton.trigger("click");

        await waitForExpect(async () => {
            const updatedUser = (await db.docs.get({ _id: mockUserDto._id })) as UserDto;

            expect(updatedUser.name).toBe(mockUserDto.name);
            expect(updatedUser.email).toBe(mockUserDto.email);
        });
    });

    it.skip("can delete a user", async () => {
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
            // console.log(deleteButton.attributes());
            expect(deleteButton.exists()).toBe(true);
        });
        await deleteButton!.trigger("click"); // Click the delete button

        let deleteModalButton;
        await waitForExpect(async () => {
            deleteModalButton = wrapper.find('[data-test="modal-primary-button"]');
            // console.log(wrapper.html());
            expect(deleteModalButton.exists()).toBe(true);
        });
        await deleteModalButton!.trigger("click"); // Accept dialog

        // await waitForExpect(async () => {
        //     const deletedLanguage = await db.docs.where({ _id: mockUserDto._id }).toArray();

        //     expect(deletedLanguage.length).toBe(0);
        // });
    });
});
