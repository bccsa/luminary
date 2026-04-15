import "reflect-metadata";
import processDefaultPermissionsDto from "./processDefaultPermissionsDto";
import { DefaultPermissionsDto } from "src/dto/DefaultPermissionsDto";

// defaultPermissions is a singleton document that controls which groups are automatically
// assigned to every user (defaultGroups). Its _id is always "defaultPermissions"; memberOf
// is assigned by the caller like other docTypes and enforced via ACL.

describe("processDefaultPermissionsDto", () => {
    it("enforces the singleton _id of 'defaultPermissions' to prevent duplicate docs", async () => {
        const doc = {
            _id: "some-random-id",
            memberOf: [],
            defaultGroups: [],
        } as unknown as DefaultPermissionsDto;

        await processDefaultPermissionsDto(doc);

        expect(doc._id).toBe("defaultPermissions");
    });

    it("overwrites any caller-supplied _id with 'defaultPermissions'", async () => {
        const doc = {
            _id: "attacker-supplied-id",
            memberOf: [],
            defaultGroups: ["group-public"],
        } as unknown as DefaultPermissionsDto;

        await processDefaultPermissionsDto(doc);

        expect(doc._id).toBe("defaultPermissions");
    });

    it("preserves caller-supplied memberOf so it can be assigned like other docTypes", async () => {
        const doc = {
            _id: "defaultPermissions",
            memberOf: ["group-super-admins", "group-editors"],
            defaultGroups: [],
        } as unknown as DefaultPermissionsDto;

        await processDefaultPermissionsDto(doc);

        expect(doc.memberOf).toEqual(["group-super-admins", "group-editors"]);
    });

    it("preserves defaultGroups unchanged — these are the groups auto-assigned to every user", async () => {
        const doc = {
            _id: "defaultPermissions",
            memberOf: [],
            defaultGroups: ["group-public-users", "group-members"],
        } as unknown as DefaultPermissionsDto;

        await processDefaultPermissionsDto(doc);

        expect(doc.defaultGroups).toEqual(["group-public-users", "group-members"]);
    });
});
