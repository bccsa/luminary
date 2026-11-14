import type { AclPermission, DocType, GroupAclEntryDto, GroupDto } from "luminary-shared";

export type AclFilter = { types: DocType[]; permissions: AclPermission[] };

export function isAclFilterActive(f: AclFilter): boolean {
    return f.types.length > 0 || f.permissions.length > 0;
}

/** An entry matches when its type is selected (if any) and it grants every selected permission. */
export function aclEntryMatches(entry: GroupAclEntryDto, f: AclFilter): boolean {
    if (entry.permission.length === 0) return false;
    if (f.types.length > 0 && !f.types.includes(entry.type)) return false;
    return f.permissions.every((p) => entry.permission.includes(p));
}

/** Returns groups with their ACL narrowed to matching entries; unchanged when no filter is active. */
export function filterGroupAcl(groups: GroupDto[], f: AclFilter): GroupDto[] {
    if (!isAclFilterActive(f)) return groups;
    return groups.map((g) => ({ ...g, acl: g.acl.filter((e) => aclEntryMatches(e, f)) }));
}
