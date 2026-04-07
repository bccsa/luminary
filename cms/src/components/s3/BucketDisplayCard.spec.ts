import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import BucketDisplayCard from "./BucketDisplayCard.vue";
import { type GroupDto, type StorageDto, DocType, AclPermission, accessMap } from "luminary-shared";
import { superAdminAccessMap, mockGroupDtoPublicContent } from "@/tests/mockdata";

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isSmallScreen: ref(false),
    };
});

const baseBucket: StorageDto & { connectionStatus: string; statusMessage?: string } = {
    _id: "storage-test",
    type: DocType.Storage,
    updatedTimeUtc: 1704114000000,
    memberOf: ["group-public-content"],
    name: "test bucket",
    storageType: "image" as any,
    publicUrl: "http://localhost:9000/images",
    connectionStatus: "connected",
    mimeTypes: ["image/*"],
};

const groups: GroupDto[] = [mockGroupDtoPublicContent];

describe("BucketDisplayCard", () => {
    beforeEach(() => {
        accessMap.value = superAdminAccessMap;
    });

    it("renders the bucket name capitalised", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });
        expect(wrapper.text()).toContain("Test bucket");
    });

    it("renders the public URL", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });
        expect(wrapper.text()).toContain("http://localhost:9000/images");
    });

    it("shows Connected status for connected bucket", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });
        expect(wrapper.text()).toContain("Connected");
    });

    it("shows Unreachable status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "unreachable" }, groups },
        });
        expect(wrapper.text()).toContain("Unreachable");
    });

    it("shows Unauthorized status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "unauthorized" }, groups },
        });
        expect(wrapper.text()).toContain("Unauthorized");
    });

    it("shows Not Found status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "not-found" }, groups },
        });
        expect(wrapper.text()).toContain("Not Found");
    });

    it("shows No Credentials status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "no-credentials" }, groups },
        });
        expect(wrapper.text()).toContain("No Credentials");
    });

    it("shows Checking status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "checking" }, groups },
        });
        expect(wrapper.text()).toContain("Checking...");
    });

    it("shows Unknown for unrecognised status", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, connectionStatus: "something-else" }, groups },
        });
        expect(wrapper.text()).toContain("Unknown");
    });

    it("displays group badges for assigned groups", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });
        expect(wrapper.text()).toContain("Public Content");
    });

    it("shows 'No groups' when bucket has no group membership", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: { ...baseBucket, memberOf: [] }, groups },
        });
        expect(wrapper.text()).toContain("No groups");
    });

    it("renders the last updated date", () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });
        // Should render some date string (exact format depends on locale)
        const text = wrapper.text();
        // 1704114000000 = Jan 1, 2024
        expect(text).toMatch(/2024|1\/1/);
    });

    it("emits edit event when clicked and user has edit permission", async () => {
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });

        await wrapper.find("div").trigger("click");
        expect(wrapper.emitted("edit")).toBeTruthy();
        expect(wrapper.emitted("edit")![0]).toEqual([baseBucket]);
    });

    it("does not emit edit event when user lacks edit permission", async () => {
        accessMap.value = {};
        const wrapper = mount(BucketDisplayCard, {
            props: { bucket: baseBucket, groups },
        });

        await wrapper.find("div").trigger("click");
        expect(wrapper.emitted("edit")).toBeFalsy();
    });
});
