import { defineStore } from "pinia";
import { DocType, type Group, type GroupDto, type Uuid } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { computed, type Ref } from "vue";
import type { Observable } from "rxjs";
import { db } from "@/db/baseDatabase";

export const useGroupStore = defineStore("group", () => {
    const groups: Readonly<Ref<Group[] | undefined>> = useObservable(
        liveQuery(async () =>
            db.docs.where("type").equals(DocType.Group).toArray(),
        ) as unknown as Observable<Group[]>,
    );

    const group = computed(() => {
        return (groupId: Uuid) => groups.value?.find((g) => g._id == groupId);
    });

    const updateGroup = async (group: GroupDto) => {
        await db.docs.put(group);
        await db.localChanges.put({
            doc: group,
        });
    };

    return { groups, group, updateGroup };
});
