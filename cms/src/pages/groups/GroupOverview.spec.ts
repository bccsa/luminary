import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import GroupOverview from "./GroupOverview.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import express from "express";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    mockGroupDtoSuperAdmins,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { accessMap, DocType, getRest, initConfig } from "luminary-shared";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router");

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
                mockGroupDtoPublicContent,
                mockGroupDtoPublicUsers,
                mockGroupDtoPublicEditors,
                mockGroupDtoSuperAdmins,
            ],
        }),
    );
});

app.listen(port, () => {
    console.log(`Mock api running on port ${port}.`);
});

describe("GroupOverview", () => {
    beforeAll(async () => {
        accessMap.value = superAdminAccessMap;
        initConfig({
            cms: false,
            docsIndex:
                "type, parentId, updatedTimeUtc, slug, language, docType, redirect, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language+status+parentPinned], [type+language+status], [type+postType], [type+docType], title, parentPinned",
            apiUrl: `http://localhost:${port}`,
            docTypes: [{ type: DocType.Group, contentOnly: true, syncPriority: 10 }],
        });

        // Reset the rest api client to use the new config
        getRest({ reset: true });
    });

    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays all groups", async () => {
        const wrapper = mount(GroupOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Users");
            expect(wrapper.text()).toContain("Public Editors");
            expect(wrapper.text()).toContain("Super Admins");
        });
    });

    it("can create a new group", async () => {
        const wrapper = mount(GroupOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create group");
        });

        await wrapper.find('button[data-test="createGroupButton"]').trigger("click");

        expect(wrapper.text()).toContain("New group");
    });

    it("can correctly query the api", async () => {
        mount(GroupOverview);

        await waitForExpect(() => {
            expect(JSON.parse(mockApiRequest).types[0]).toBe(DocType.Group);
        });
    });
});
