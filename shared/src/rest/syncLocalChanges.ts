import { watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqWarnings } from "../config";

let running = false;

async function attemptSend(
    change: LocalChangeDto,
    formData: LFormData,
    attempts: number,
): Promise<void> {
    const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
    if (res) {
        changeReqWarnings.value = [];
        changeReqErrors.value = [];
        await db.applyLocalChangeAck(res, change);
        return;
    }
    if (attempts >= 2) {
        changeReqErrors.value.push(
            "Unable to save changes. Please refresh the page and try again.",
        );
        return;
    }
    await new Promise((r) => setTimeout(r, 100));
    return attemptSend(change, formData, attempts + 1);
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

                const formData = new LFormData();
                formData.append("changeRequest", change);

                await attemptSend(change, formData, 0);
            } catch (err) {
                console.error("syncLocalChanges error:", err);
            } finally {
                running = false;
            }
        },
        { immediate: true },
    );
}
