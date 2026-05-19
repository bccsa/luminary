import { watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqWarnings } from "../config";

let running = false;

async function drain() {
    if (running) return;
    running = true;
    try {
        const change = (await db.localChanges.toCollection().first()) as LocalChangeDto | undefined;
        if (!change) return;

        const formData = new LFormData();
        formData.append("changeRequest", change);

        for (let attempts = 0; attempts < 3; attempts++) {
            if (!isConnected.value) return;
            const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
            if (res) {
                changeReqWarnings.value = [];
                changeReqErrors.value = [];
                await db.applyLocalChangeAck(res, change);
                return;
            }
            if (attempts < 2) await new Promise((r) => setTimeout(r, 100));
        }
    } finally {
        running = false;
    }
}

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>) {
    watch(
        [isConnected, localChanges],
        () => {
            if (!isConnected.value || localChanges.value.length === 0) return;
            drain().catch((err) => console.error("syncLocalChanges drain error:", err));
        },
        { immediate: true },
    );
}
