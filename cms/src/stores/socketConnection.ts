import { defineStore } from "pinia";
import { getSocket } from "@/socket";
import {
    DocType,
    type ApiDataResponseDto,
    type ChangeReqAckDto,
    AclPermission,
    type Uuid,
    type AccessMap,
    type DocGroupAccess,
} from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { useLocalChangeStore } from "./localChanges";
import { BaseRepository } from "@/db/repositories/baseRepository";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);

    const bindEvents = () => {
        const socket = getSocket();

        socket.on("connect", async () => {
            isConnected.value = true;

            // Get documents that are newer than the last received version
            const syncVersionString = localStorage.getItem("syncVersion");
            let syncVersion = 0;
            if (syncVersionString) syncVersion = Number.parseInt(syncVersionString);

            socket.emit("clientDataReq", {
                version: syncVersion,
                cms: true,
                accessMap: JSON.parse(localStorage.getItem("accessMap")),
            });
        });

        socket.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.on("data", async (data: ApiDataResponseDto) => {
            await db.docs.bulkPut(data.docs);
            if (data.version) localStorage.setItem("syncVersion", data.version.toString());
        });

        socket.on("changeRequestAck", async (ack: ChangeReqAckDto) => {
            const localChangeStore = useLocalChangeStore();

            await localChangeStore.handleAck(ack);
        });

        socket.on("accessMap", (accessMap: AccessMap) => {
            // Delete revoked documents
            // TODO: Only delete documents if the accessMap changed
            const baseRepository = new BaseRepository();
            const groupsPerDocType = accessMapToGroups(accessMap, AclPermission.View);

            Object.values(DocType)
                .filter((t) => !(t == DocType.Change || t == DocType.Content))
                .forEach(async (docType) => {
                    let groups = groupsPerDocType[docType as DocType];
                    if (groups === undefined) groups = [];

                    const revokedDocs = baseRepository.whereNotMemberOf(groups, docType as DocType);

                    // Delete associated Post and Tag content documents
                    if (docType === DocType.Post || docType === DocType.Tag) {
                        const revokedParents = await revokedDocs.toArray();
                        const revokedParentIds = revokedParents.map((p) => p._id);
                        await baseRepository.whereParentIds(revokedParentIds).delete();
                    }

                    // Delete associated Language content documents
                    if (docType === DocType.Language) {
                        const revokedLanguages = await revokedDocs.toArray();
                        const revokedlanguageIds = revokedLanguages.map((l) => l._id);
                        await baseRepository.whereLanguageIds(revokedlanguageIds).delete();
                    }

                    await revokedDocs.delete();

                    // TODO: Delete revoked groups
                });

            // Store the updated access map
            localStorage.setItem("accessMap", JSON.stringify(accessMap));
        });
    };

    return { isConnected, bindEvents };
});

/**
 * Convert an access map to a list of accessible groups per document type for a given permission
 */
function accessMapToGroups(accessMap: AccessMap, permission: AclPermission): DocGroupAccess {
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
