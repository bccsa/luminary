import { getJwtPermission, parsePermissionMap } from "./jwtPermissionMap";

describe("jwtPremissionMap", () => {
    const config = {
        permissionMap: `{
            "jwt": {
                "groups": {
                    "group-super-admins": "() => true"
                },
                "userId": {
                    "user-super-admin": "() => true"
                }
            }
        }`,
    };

    it("can parse a jwt permission map", async () => {
        const parsed = parsePermissionMap(config.permissionMap);

        expect(parsed.jwt["groups"]["group-super-admins"]("any jwt data")).toBe(true);
    });

    it("can evaluate a permission map", async () => {
        const parsed = parsePermissionMap(config.permissionMap);
        const evaluated = getJwtPermission("any jwt data", parsed);

        expect(evaluated.groups).toContain("group-super-admins");
        expect(evaluated.userId).toBe("user-super-admin");
    });
});
