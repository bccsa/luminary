import { defineStore } from "pinia";
import { getSocket } from "@/socket";
import {
    DocType,
    type ApiDataResponseDto,
    AclPermission,
    type Uuid,
    type AccessMap,
    type DocGroupAccess,
} from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { Socket } from "socket.io-client";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);
    const socket = ref<Socket>();

    const reloadClientData = () => {
        if (!socket.value) {
            throw "No socket connected, aborting";
        }

        socket.value!.emit("clientDataReq");
    };

    const bindEvents = () => {
        socket.value = getSocket();

        socket.value.on("connect", async () => {
            isConnected.value = true;

            // Get documents that are newer than the last received version
            const syncVersionString = localStorage.getItem("syncVersion");
            let syncVersion = 0;
            if (syncVersionString) syncVersion = Number.parseInt(syncVersionString);

            socket.value!.emit("clientDataReq", {
                version: syncVersion,
                accessMap: JSON.parse(localStorage.getItem("accessMap")!),
            });
        });

        socket.value.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.value.on("data", async (data: ApiDataResponseDto) => {
            await db.docs.bulkPut(data.docs);
            if (data.version) localStorage.setItem("syncVersion", data.version.toString());
        });

        //   TODO: Add sync code from shared library
    };

    return { isConnected, bindEvents, reloadClientData };
});

/**
 * Convert an access map to a list of accessible groups per document type for a given permission
 */
export function accessMapToGroups(accessMap: AccessMap, permission: AclPermission): DocGroupAccess {
    const groups: DocGroupAccess = {};

    Object.keys(accessMap).forEach((groupId: Uuid) => {
        Object.keys(accessMap[groupId as Uuid]).forEach((docType) => {
            const docTypePermissions = accessMap[groupId as Uuid][docType as DocType];

            if (!docTypePermissions) return;
            Object.keys(docTypePermissions)
                .filter((p) => p === permission)
                .forEach((_permission) => {
                    if (docTypePermissions[_permission as AclPermission]) {
                        if (!groups[docType as DocType]) groups[docType as DocType] = [];
                        groups[docType as DocType]?.push(groupId as Uuid);
                    }
                });
        });
    });
    return groups;
}
