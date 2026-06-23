import { Ref } from "vue";
import { useDexieLiveQuery, UseDexieLiveQueryOptions } from "../useDexieLiveQuery";
import { createEditable } from "../createEditable";
import { BaseDocumentDto, Uuid } from "../../types";
import { db, UpsertOptions } from "../../db/database";

/**
 * Creates an editable live query from a Dexie database query that can track changes and save modifications.
 *
 * This function combines live database querying with editable functionality, allowing you to:
 * - Query data from Dexie database with live updates
 * - Track changes made to individual items
 * - Save modified items back to the database
 *
 * @template T - The document type extending BaseDocumentDto
 * @template I - The type of the optional initial value (should match T or be undefined)
 * @template Immediate - Watch option to determine if the query should run immediately when used with dependencies (deps)
 *
 * @param querier - A function that returns an array of documents or a Promise resolving to an array
 * @param options - Configuration options for the live query with dependencies
 * @param deps - Optional dependencies that trigger query re-execution when changed
 *
 * @returns An object containing:
 *   - `source` - The reactive source data from the live query
 *   - `editable` - Reactive editable copy of the data
 *   - `isEdited` - Function to check if an item has been modified
 *   - `updateShadow` - Function to update the shadow copy after saving
 *   - `save` - Async function to save changes for a specific item by ID
 *  - `isLocalChange` - Returns a reactive ref that indicates whether there are local changes for a specific item by ID
 *
 * @example
 * ```typescript
 * const { source, editable, save, isEdited, isLocalChange } = useDexieLiveQueryAsEditable(
 *   () => db.users.toArray(),
 *   { immediate: true }
 * );
 *
 * // Modify an item
 * editable.value[0].name = "New Name";
 *
 * // Save the changes
 * await save(editable.value[0]._id);
 * ```
 */
export function useDexieLiveQueryAsEditable<
    T extends BaseDocumentDto,
    I = undefined,
    Immediate extends Readonly<boolean> = true,
>(
    querier: () => T[] | Promise<T[]>,
    options: UseDexieLiveQueryOptions<I, Immediate> = {},
    deps?: any,
) {
    // The unified useDexieLiveQuery handles a `deps`-driven re-run internally
    // (re-runs on change when set, runs once when undefined), so no branch needed.
    const source = useDexieLiveQuery(querier, { ...options, deps });

    const c = createEditable<T>(source as Ref<Array<T>> | undefined);

    const save = async (id: Uuid) => {
        if (!c.isEdited.value(id)) return { ack: "accepted" as const };

        const item = c.editable.value.find((i) => i._id === id);
        if (!item) return { ack: "rejected" as const, message: "Item not found" };

        await db.upsert({ doc: item, overwriteLocalChanges: true } as UpsertOptions<T>);
        c.updateShadow(id);
        return {
            ack: "accepted" as const,
            message: "Saved locally and queued for upload to the server",
        };
    };

    const isLocalChange = (id: Uuid) =>
        useDexieLiveQuery(
            () =>
                db.localChanges
                    .where({ docId: id })
                    .first()
                    .then((res) => !!res),
            { initialValue: false },
        );

    return { source, ...c, save, isLocalChange };
}
