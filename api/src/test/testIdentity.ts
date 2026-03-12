import type { ResolvedIdentity } from "../auth/auth-identity.service";
import { DocType } from "../enums";

/** Minimal resolved identity for specs that call services requiring ResolvedIdentity. */
export const MOCK_IDENTITY: ResolvedIdentity = {
    user: {
        _id: "user-super-admin",
        type: DocType.User,
        email: "test@123.com",
        name: "Test User",
        memberOf: ["group-super-admins"],
    } as any,
    groupIds: ["group-super-admins"],
};
