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
import { BaseRepository } from "@/db/repositories/baseRepository";
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

        socket.value.on("accessMap", (accessMap: AccessMap) => {
            // Delete revoked documents

            // TODO: Only delete documents if the accessMap changed for improved performance
            const baseRepository = new BaseRepository();
            const groupsPerDocType = accessMapToGroups(accessMap, AclPermission.View);

            Object.values(DocType)
                .filter((t) => !(t == DocType.Change || t == DocType.Content))
                .forEach(async (docType) => {
                    let groups = groupsPerDocType[docType as DocType];
                    if (groups === undefined) groups = [];

                    const revokedDocs = baseRepository.whereNotMemberOf(groups, docType as DocType);
                    const expiredDocs = baseRepository.whereExpired();

                    // Convert both to arrays
                    const revokedDocsArray = await revokedDocs.toArray();
                    const expiredDocsArray = await expiredDocs.toArray();

                    // Combine the arrays
                    const toDelete = revokedDocsArray.concat(expiredDocsArray);
                    console.log(toDelete);

                    // Delete associated Post and Tag content documents
                    if (docType === DocType.Post || docType === DocType.Tag) {
                        const revokedParentIds = revokedDocsArray.map((p) => p._id);
                        await baseRepository.whereParentIds(revokedParentIds).delete();
                    }

                    // Delete associated Language content documents
                    if (docType === DocType.Language) {
                        const revokedlanguageIds = revokedDocsArray.map((l) => l._id);
                        await baseRepository.whereLanguageIds(revokedlanguageIds).delete();
                    }

                    // Delete documents in the combined array
                    for (const doc of toDelete) {
                        await baseRepository.whereId(doc._id).delete();
                    }
                });

            // Store the updated access map
            localStorage.setItem("accessMap", JSON.stringify(accessMap));
        });
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
