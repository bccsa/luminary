import {
    DocType,
    type GroupDto,
    type Group,
    AclPermission,
    type CreateGroupDto,
    type Uuid,
} from "@/types";
import { BaseRepository } from "./baseRepository";
import { db } from "../baseDatabase";
import { v4 as uuidv4 } from "uuid";

export class GroupRepository extends BaseRepository {
    constructor() {
        super();
    }

    async create(dto: CreateGroupDto) {
        const id = uuidv4();

        const group: GroupDto = {
            _id: id,
            name: dto.name,
            type: DocType.Group,
            updatedTimeUtc: Date.now(),
            acl: dto.acl ?? [
                // TODO: Don't hardcode access to super admin
                {
                    groupId: "group-super-admins",
                    type: DocType.Group,
                    permission: [
                        AclPermission.View,
                        AclPermission.Create,
                        AclPermission.Edit,
                        AclPermission.Delete,
                        AclPermission.Assign,
                    ],
                },
            ],
        };

        await db.docs.put(group);

        await db.localChanges.put({
            doc: group,
        });
    }

    async update(group: GroupDto) {
        await db.docs.put(group);
        await db.localChanges.put({
            doc: group,
        });
    }

    async getAll() {
        return this.whereType(DocType.Group).toArray();
    }

    async getGroupsWithIds(ids: Uuid[]): Promise<Group[]> {
        return this.whereIds(ids).toArray() as unknown as Promise<Group[]>;
    }
}
