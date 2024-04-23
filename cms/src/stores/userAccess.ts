import { defineStore } from "pinia";
import { AclPermission, DocType, type AccessMap, type Uuid } from "@/types";
import { useLocalStorage } from "@vueuse/core";
import { computed, type Ref } from "vue";

export const useUserAccessStore = defineStore("userAccess", () => {
    const accessMap: Ref<AccessMap> = useLocalStorage("accessMap", {});

    const updateAccessMap = (newAccessMap: AccessMap) => {
        accessMap.value = newAccessMap;
    };

    const verifyAccess = computed(
        () => (targetGroups: Uuid[], docType: DocType, permission: AclPermission) => {
            for (const targetGroup of targetGroups) {
                if (
                    accessMap.value[targetGroup] &&
                    accessMap.value[targetGroup][docType] &&
                    accessMap.value[targetGroup][docType]![permission]
                ) {
                    return true;
                }
            }

            return false;
        },
    );

    const hasAnyPermission = computed(() => (docType: DocType, permission: AclPermission) => {
        return verifyAccess.value(Object.keys(accessMap.value), docType, permission);
    });

    return { accessMap, updateAccessMap, verifyAccess, hasAnyPermission };
});
