import { defineStore } from "pinia";
import {
    AclPermission,
    DocType,
    type CreateGroupDto,
    type Group,
    type GroupDto,
    type Uuid,
} from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { db } from "@/db/baseDatabase";
import { v4 as uuidv4 } from "uuid";

export const useGroupStore = defineStore("group", () => {
    const groups: Readonly<Ref<Group[] | undefined>> = useObservable(
        liveQuery(async () =>
            db.docs.where("type").equals(DocType.Group).toArray(),
        ) as unknown as Observable<Group[]>,
    );

    const group = computed(() => {
        return (groupId: Uuid) => groups.value?.find((g) => g._id == groupId);
    });

    const createGroup = async (dto: CreateGroupDto) => {
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
    };

    const updateGroup = async (group: GroupDto) => {
        await db.docs.put(group);
        await db.localChanges.put({
            doc: group,
        });
    };

    return { groups, group, createGroup, updateGroup };
});
