import { defineStore } from "pinia";
import { type CreateGroupDto, type Group, type GroupDto, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { GroupRepository } from "@/db/repositories/groupRepository";

export const useGroupStore = defineStore("group", () => {
    const groupRepository = new GroupRepository();

    const groups: Readonly<Ref<Group[] | undefined>> = useObservable(
        liveQuery(async () => groupRepository.getAll()) as unknown as Observable<Group[]>,
    );

    const group = computed(() => {
        return (groupId: Uuid) => groups.value?.find((g) => g._id == groupId);
    });

    const createGroup = async (dto: CreateGroupDto) => {
        await groupRepository.create(dto);
    };

    const updateGroup = async (group: GroupDto) => {
        await groupRepository.update(group);
    };

    return { groups, group, createGroup, updateGroup };
});
