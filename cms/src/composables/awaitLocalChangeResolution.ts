import { effectScope, watch } from "vue";
import { db, isConnected, useDexieLiveQuery, type Uuid } from "luminary-shared";

// ponytail: works around toEditable.save()'s optimistic-only ack (shared/ is currently
// locked to the senior) by watching the localChanges queue drain instead. Delete this once
// toEditable exposes a real awaitAck option.
export async function awaitLocalChangeResolution(
    docId: Uuid,
    timeoutMs = 8000,
): Promise<"resolved" | "pending"> {
    if (!isConnected.value) return "pending";
    return new Promise((resolve) => {
        const scope = effectScope(true);
        const timer = setTimeout(() => finish("pending"), timeoutMs);
        function finish(result: "resolved" | "pending") {
            clearTimeout(timer);
            scope.stop();
            resolve(result);
        }
        scope.run(() => {
            const count = useDexieLiveQuery(() => db.localChanges.where({ docId }).count(), {
                initialValue: undefined as number | undefined,
            });
            watch(count, (n) => n === 0 && finish("resolved"), { immediate: true });
            watch(isConnected, (online) => !online && finish("pending"));
        });
    });
}
