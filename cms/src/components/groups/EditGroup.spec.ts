import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, afterAll, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import express from "express";
import bodyParser from "body-parser";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    mockGroupDtoSuperAdmins,
    superAdminAccessMap,
} from "@/tests/mockdata";
import {
    accessMap,
    AclPermission,
    db,
    DocType,
    type GroupAclEntryDto,
    type GroupDto,
    isConnected,
    AckStatus,
    initConfig,
    getRest,
} from "luminary-shared";
import waitForExpect from "wait-for-expect";
import EditGroup from "./EditGroup.vue";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as any),
        createRouter: () => ({
            push: vi.fn(),
            beforeEach: vi.fn(),
            afterEach: vi.fn(),
        }),
        useRouter: () => ({
            push: vi.fn(),
        }),
        onBeforeRouteLeave: vi.fn(),
    };
});

// ============================
// Mock api
// ============================
const app = express();
app.use(bodyParser.json());
app.use(
    bodyParser.urlencoded({
        extended: true,
    }),
);

const port = 12348;

let mockApiRequest: { doc: any };
app.post("/changerequest", (req, res) => {
    mockApiRequest = req.body;
    res.end(JSON.stringify({ doc: req.body.doc, ack: AckStatus.Accepted }));
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

const groups = ref<Map<string, GroupDto>>(new Map());
groups.value.set(mockGroupDtoPublicContent._id, mockGroupDtoPublicContent);
groups.value.set(mockGroupDtoPublicEditors._id, mockGroupDtoPublicEditors);
groups.value.set(mockGroupDtoPublicUsers._id, mockGroupDtoPublicUsers);
groups.value.set(mockGroupDtoSuperAdmins._id, mockGroupDtoSuperAdmins);

describe("EditGroup.vue", () => {
    const saveChangesButton = 'button[data-test="saveChanges"]';
    const discardChangesButton = 'button[data-test="discardChanges"]';
    const newGroups = ref<GroupDto[]>([]);

    const createWrapper = async (group: GroupDto) => {
        const wrapper = mount(EditGroup, {
            props: {
                group,
                newGroups: newGroups.value,
            },
            global: {
                provide: {
                    groups: groups,
                },
            },
        });
        // Open up the accordion
        await wrapper.find("button").trigger("click");

        let permissionCell;
        await waitForExpect(async () => {
            permissionCell = wrapper.find('[data-test="permissionCell"]');
            expect(permissionCell.exists()).toBe(true);
        });

        return wrapper;
    };

    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: false,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
            syncList: [{ type: DocType.Group, contentOnly: true, syncPriority: 10 }],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        isConnected.value = true;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("displays all ACL groups under the given group", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Users");
            expect(wrapper.text()).toContain("Public Editors");
        });
    });

    it("displays buttons when changing a value", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).toContain("Discard changes");
        expect(wrapper.text()).toContain("Save changes");
    });

    it("displays a label when there are unsaved changes and the accordion is closed", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).not.toContain("Unsaved changes");

        // Close the accordion
        await wrapper.find("button").trigger("click");

        expect(wrapper.text()).toContain("Unsaved changes");
    });

    it("can save changes", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(saveChangesButton).trigger("click");

        await waitForExpect(async () => {
            expect(mockApiRequest.doc!.acl).not.toEqual(mockGroupDtoPublicContent.acl);
        });
    });

    it("can hide the save button after changes has been saved", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(saveChangesButton).trigger("click");

        waitForExpect(() => {
            expect(Object.keys(wrapper.find(saveChangesButton)).length).toBeLessThan(1);
        });
    });

    it("can discard all changes", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        await wrapper.find(discardChangesButton).trigger("click");

        expect(wrapper.find(saveChangesButton).exists()).toBe(false);
        expect(wrapper.find(discardChangesButton).exists()).toBe(false);
    });

    it("can add a new group", async () => {
        await db.docs.bulkPut([mockGroupDtoPublicEditors, mockGroupDtoPublicContent]);

        const wrapper = await createWrapper(mockGroupDtoPublicContent);
        expect(wrapper.text()).not.toContain("Super Admins");

        await wrapper.find('button[data-test="addGroupButton"]').trigger("click");
        await wrapper.find('button[data-test="selectGroupButton"]').trigger("click");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
        });
    });

    it("can edit the group name", async () => {
        const groupNameInput = 'input[data-test="groupNameInput"]';
        const groupName = '[data-test="groupName"]';
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find(groupName).trigger("click");

        expect(wrapper.find(groupNameInput).isVisible()).toBe(true);
        expect(wrapper.find(groupName).exists()).toBe(false);

        await wrapper.find(groupNameInput).setValue("New group name");
        await wrapper.find(groupNameInput).trigger("blur");

        expect(wrapper.find(groupNameInput).exists()).toBe(false);
        expect(wrapper.find(groupName).text()).toBe("New group name");
        expect(wrapper.find(saveChangesButton).exists()).toBe(true);

        // Reset back to old value, save changes button should vanish
        await wrapper.find(groupName).trigger("click");
        await wrapper.find(groupNameInput).setValue("Public Content");
        await wrapper.find(groupNameInput).trigger("blur");

        expect(wrapper.find(saveChangesButton).exists()).toBe(false);
    });

    it("duplicate the whole group", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.find("button[data-test='duplicateGroup']").trigger("click");

        const _group = wrapper.emitted("duplicateGroup");
        const _groupData = _group![0][0] as GroupDto;
        expect(_groupData.name).toBe("Public Content - copy");
    });

    it("can copy a group's ID", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);
        let clipboardContents = "";
        // @ts-ignore
        window.__defineGetter__("navigator", function () {
            return {
                clipboard: {
                    writeText: (text: string) => {
                        clipboardContents = text;
                    },
                },
            };
        });

        await wrapper.find("button[data-test='copyGroupId']").trigger("click");

        expect(clipboardContents).toBe(mockGroupDtoPublicContent._id);
    });

    it("removes an existing group ACL if all permissions are removed", async () => {
        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        // Group=Public Editors, DocType=Post, Permission=View  -  Clearing this should clear all the permissions, and cause the ACL entry to be deleted
        await wrapper.findAll('[data-test="permissionCell"]')[12].trigger("click");
        await wrapper.find(saveChangesButton).trigger("click");

        await waitForExpect(async () => {
            const group = groups.value.get(mockGroupDtoPublicContent._id);
            expect(
                group!.acl?.some(
                    (g) => g.groupId == "group-public-editors" && g.type == DocType.Post,
                ),
            ).toBeFalsy();
        });
    });

    it("checks if groups are disabled when no edit permissions", async () => {
        delete accessMap.value["group-public-content"].group?.edit;

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        expect(wrapper.text()).toContain("No edit access.");
        expect(wrapper.find("button[title='Duplicate']").exists()).toBe(false);
        expect(wrapper.find("button[data-test='addGroupButton']").exists()).toBe(false);
    });

    it("shows the assigned group's ID when the assigned group is not available to the user", async () => {
        const groupDoc = {
            ...mockGroupDtoPublicContent,
            acl: [
                { groupId: "group-not-available", type: "group", permission: [AclPermission.Edit] },
            ] as GroupAclEntryDto[],
        };

        groups.value.set(groupDoc._id, groupDoc);

        const wrapper = await createWrapper(groupDoc);

        // check that the group ID is shown
        expect(wrapper.text()).toContain("group-not-available");

        // check that editing is disabled
        expect(wrapper.text()).toContain("No edit access.");
        expect(wrapper.find("button[title='Duplicate']").exists()).toBe(false);
        expect(wrapper.find("button[data-test='addGroupButton']").exists()).toBe(false);
    });

    it("disables editing when api is offline", async () => {
        isConnected.value = false;

        const wrapper = await createWrapper(mockGroupDtoPublicContent);

        await wrapper.findAll('[data-test="permissionCell"]')[12].trigger("click");

        expect(Object.keys(wrapper.find(saveChangesButton)).length).toBeLessThan(1);
    });
});
