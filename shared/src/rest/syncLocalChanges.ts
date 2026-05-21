import { watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqWarnings } from "../config";

let running = false;

async function send(change: LocalChangeDto): Promise<boolean> {
    const formData = new LFormData();
    formData.append("changeRequest", change);

    const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
    if (!res) return false;

    changeReqWarnings.value = [];
    changeReqErrors.value = [];
    await db.applyLocalChangeAck(res, change);
    return true;
}

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>) {
    watch(
        [isConnected, localChanges],
        async () => {
            if (!isConnected.value || localChanges.value.length === 0) return;
            if (running) return;
            running = true;
            try {
                const change = (await db.localChanges.toCollection().first()) as
                    | LocalChangeDto
                    | undefined;
                if (!change) return;

                for (let attempt = 0; attempt < 3; attempt++) {
                    if (!isConnected.value) return;
                    if (await send(change)) return;
                    if (attempt < 2) await new Promise((r) => setTimeout(r, 100));
                }

                changeReqErrors.value.push(
                    "Unable to submit saved changes. Please refresh the page to try again.",
                );
            } catch (err) {
                console.error("syncLocalChanges error:", err);
            } finally {
                running = false;
            }
        },
        { immediate: true },
    );
}
