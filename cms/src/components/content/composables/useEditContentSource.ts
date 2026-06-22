import { computed, ref, watch, type Ref, type WritableComputedRef } from "vue";
import {
    db,
    DocType,
    type ContentDto,
    type ContentParentDto,
    type PostDto,
    type PostType,
    type TagDto,
    type TagType,
    type Uuid,
    useHybridQuery,
    toEditable,
    queryLocal,
} from "luminary-shared";
import * as _ from "lodash";

export type UseEditContentSourceOptions = {
    /** The route `id` param as a getter (reactive). `"new"` starts a fresh draft. */
    id: () => string;
    docType: DocType.Post | DocType.Tag;
    tagOrPostType: TagType | PostType;
    /** Called when an existing parent id resolves to nothing in the database. */
    onParentNotFound: () => void;
};

export type UseEditContentSource = {
    /** The id currently being edited. Updated on route change and by {@link installClones}. */
    currentId: Ref<Uuid>;
    /** True when the initial route param was `"new"`. */
    newDocument: boolean;
    /** Editable parent doc (single-doc adapter over the toEditable array). */
    editableParent: WritableComputedRef<ContentParentDto>;
    /** Editable content children. */
    editableContent: Ref<ContentDto[]>;
    /** Clean DB baseline for the parent (read-only diff source). */
    existingParent: Ref<ContentParentDto | undefined>;
    /** Clean DB baseline for the content children (read-only diff source). */
    existingContent: Ref<ContentDto[] | undefined>;
    /** True when the parent or any content child has unsaved user edits. */
    isDirty: Ref<boolean>;
    /**
     * True when the parent or any content child has a change saved locally and queued for
     * upload but not yet acknowledged by the server (pending offline change).
     */
    hasLocalChanges: Ref<boolean>;
    /** True while an existing doc has not yet hydrated (drives the loading state). */
    isLoading: Ref<boolean>;
    /** Persist the parent + edited content children and re-baseline the dirty state. */
    save: () => Promise<void>;
    /** Revert the parent and all content children to their last-saved state. */
    revert: () => void;
    /**
     * Install duplicated (unsaved) clones as the current editable doc + children and
     * point the live queries at the new id. The clones live in `editable` but not in
     * `shadow`, so the new id's empty live source can't wipe them.
     */
    installClones: (clonedParent: ContentParentDto, clonedContent: ContentDto[]) => void;
};

/**
 * Owns the data layer of the content editor: local-first reactive loading (parent and
 * content children via {@link useHybridQuery}), editable copies with dirty tracking via
 * {@link toEditable}, and the persistence + revert + duplicate primitives. UI concerns
 * (permissions, notifications, routing, language selection) stay with the caller.
 *
 * Must be called synchronously in a component `setup` so the live subscriptions tear
 * down on unmount.
 */
export function useEditContentSource(options: UseEditContentSourceOptions): UseEditContentSource {
    const { docType, tagOrPostType, onParentNotFound } = options;

    // `currentId` is the reactive key the sources track — updated on route change and
    // on duplicate(). A "new" route generates an id up front.
    const initialId = options.id();
    const newDocument = initialId === "new";
    const currentId = ref<Uuid>(initialId === "new" ? db.uuid() : initialId);

    // Live sources — both via HybridQuery (Dexie-first + live socket). With the CMS's
    // full-content sync (OPEN_MIN cutoff), the API supplement does not run; parentId /
    // [type+_id] indexes keep Dexie reads off a full table scan.
    const liveParent = useHybridQuery<ContentParentDto>(
        () => ({ selector: { type: docType, _id: currentId.value }, $limit: 1 }),
        { live: true, persistOffline: true },
    );
    const liveContent = useHybridQuery<ContentDto>(
        () => ({
            selector: { type: DocType.Content, parentId: currentId.value },
            $sort: [{ publishDate: "desc" }],
            use_index: "content-parentId-publishDate-index",
        }),
        { live: true, persistOffline: true },
    );

    // toEditable sources. Hydrated eagerly by `load()` (`db.get` + `queryLocal`) and then
    // kept fresh by the HybridQuery watchers — but LATCHED: a transient or late empty
    // emission (re-subscription on an id change, a reconnect) never wipes already-loaded
    // data and the in-progress edits toEditable derives from it. `load()` resets + reloads
    // them when the id changes.
    const parentSource = ref<ContentParentDto[]>([]);
    const contentSource = ref<ContentDto[]>([]);
    watch(
        liveParent,
        () => {
            if (liveParent.value.length) parentSource.value = liveParent.value;
        },
        { immediate: true },
    );
    watch(
        liveContent,
        () => {
            if (liveContent.value.length) contentSource.value = liveContent.value;
        },
        { immediate: true },
    );

    // Editable copies that diff against their source. `toEditable` tracks user vs.
    // source edits so an external change doesn't clobber in-progress work; a doc present
    // in `editable` but not in `shadow` (new / just-duplicated, never saved) is never
    // removed when the source is empty — this is what protects unsaved docs.
    //
    // `imageData`/`media` are back-patched: after an upload completes the server clears
    // `uploadData` and populates `fileCollections`, then re-emits the parent. toEditable
    // keeps these two fields tracking the source even while the user edits other fields, so
    // the processed result is not lost (server-wins for these fields).
    const parentEditable = toEditable<ContentParentDto>(parentSource, {
        persistOffline: true,
        backPatchFields: ["imageData", "media"],
    });
    const contentEditable = toEditable<ContentDto>(contentSource, { persistOffline: true });
    const editableContent = contentEditable.editable;

    // Single-doc adapter: callers bind a single doc, but toEditable works on arrays.
    // Proxy slot 0 — the getter returns the live element (so in-place mutations
    // propagate), the setter handles whole-object reassigns.
    const editableParent = computed<ContentParentDto>({
        get: () => parentEditable.editable.value[0],
        set: (val) => {
            const arr = parentEditable.editable.value;
            if (arr.length === 0) arr.push(val);
            else arr.splice(0, 1, val);
        },
    });

    // "existing" baselines for read-only diff, derived from the clean source.
    const existingParent = computed<ContentParentDto | undefined>(() => parentSource.value[0]);
    const existingContent = computed<ContentDto[] | undefined>(() => contentSource.value);

    const isLoading = computed(() => editableParent.value == undefined);

    // New-document draft: seed a template parent into `editable` (NOT `shadow`) so it
    // reads as dirty and survives the empty source. Existing docs are deliberately NOT
    // seeded — they stay unrendered until `load()` hydrates the real doc, so a premature
    // save can never persist an empty placeholder.
    const seedTemplate = (id: Uuid) => {
        const template: ContentParentDto = {
            _id: id,
            type: docType,
            updatedTimeUtc: 0,
            memberOf: [],
            tags: [],
            publishDateVisible: true,
        };
        if (docType === DocType.Tag) {
            (template as TagDto).tagType = tagOrPostType as TagType;
            (template as TagDto).pinned = 0;
            (template as TagDto).publishDateVisible = false;
        } else {
            (template as PostDto).postType = tagOrPostType as PostType;
            (template as PostDto).publishDateVisible = true;
        }
        parentEditable.editable.value.splice(0, parentEditable.editable.value.length, template);
    };

    // Eagerly hydrate an existing doc's sources via a prompt one-shot read (not bound to
    // liveQuery scheduling latency), so real data is present before the user can act.
    const load = (id: Uuid) => {
        db.get<ContentParentDto>(id).then((doc) => {
            if (currentId.value !== id) return; // a newer navigation superseded this load
            if (!doc) {
                onParentNotFound();
                return;
            }
            parentSource.value = [doc];
            // Hydrate the editable directly (don't wait for toEditable's watcher hop) so
            // real data is present in one tick — unless the user already edited during
            // the load window.
            if (!parentEditable.isEdited.value(doc._id)) {
                parentEditable.editable.value.splice(
                    0,
                    parentEditable.editable.value.length,
                    _.cloneDeep(doc),
                );
                parentEditable.updateShadow(doc._id);
            }
        });
        queryLocal<ContentDto>({ selector: { type: DocType.Content, parentId: id } }).then(
            (docs) => {
                if (currentId.value === id && docs.length) contentSource.value = docs;
            },
        );
    };

    if (newDocument) seedTemplate(currentId.value);
    else load(currentId.value);

    watch(options.id, (newId) => {
        if (newId === "new") {
            currentId.value = db.uuid();
            parentSource.value = [];
            contentSource.value = [];
            seedTemplate(currentId.value);
        } else if (newId !== currentId.value) {
            currentId.value = newId;
            parentSource.value = [];
            contentSource.value = [];
            load(newId);
        }
    });

    const isDirty = computed(() => {
        if (editableParent.value && parentEditable.isEdited.value(editableParent.value._id))
            return true;
        return editableContent.value.some((c) => contentEditable.isEdited.value(c._id));
    });

    // Pending offline changes: the parent or any content child has a change queued in
    // localChanges (saved locally, not yet acked by the server).
    const hasLocalChanges = computed(() => {
        if (
            editableParent.value &&
            parentEditable.hasLocalChanges.value(editableParent.value._id)
        )
            return true;
        return editableContent.value.some((c) => contentEditable.hasLocalChanges.value(c._id));
    });

    const save = async () => {
        const parent = editableParent.value;
        if (!parent) return;
        // New doc being deleted before it was ever persisted → nothing to do.
        if (!existingParent.value && parent.deleteReq) return;

        // The parent is always persisted on save (even when unedited): this is the editor's
        // established contract, so it is written directly rather than via parentEditable.save()
        // (which would no-op an unedited parent).
        await db.upsert({ doc: parent });
        parentEditable.updateShadow(parent._id);

        if (!parent.deleteReq) {
            // Content children delegate to toEditable.save(): it no-ops unedited rows, writes
            // locally via db.upsert (these sources persist offline), and re-baselines the shadow.
            await Promise.all(
                editableContent.value.map((c: ContentDto) => {
                    const existed = existingContent.value?.some((d) => d._id === c._id);
                    // Delete request for a row that was never saved → nothing to upsert.
                    if (c.deleteReq && !existed) {
                        contentEditable.updateShadow(c._id);
                        return Promise.resolve();
                    }
                    return contentEditable.save(c._id);
                }),
            );
        }
    };

    const revert = () => {
        const pid = editableParent.value?._id;
        if (pid && existingParent.value) parentEditable.revert(pid);
        // Snapshot the ids first — revert() splices new (unsaved) rows out of the array.
        for (const id of editableContent.value.map((c) => c._id)) {
            contentEditable.revert(id);
        }
    };

    const installClones = (clonedParent: ContentParentDto, clonedContent: ContentDto[]) => {
        // The clones are unsaved, so they have no source baseline: clear the sources and
        // install the clones as in-editable-not-in-shadow docs (which the live queries
        // for the new id — emitting empty — can't wipe). Point the queries at the new id.
        parentSource.value = [];
        contentSource.value = [];
        editableParent.value = clonedParent;
        editableContent.value = clonedContent;
        currentId.value = clonedParent._id;
    };

    return {
        currentId,
        newDocument,
        editableParent,
        editableContent,
        existingParent,
        existingContent,
        isDirty,
        hasLocalChanges,
        isLoading,
        save,
        revert,
        installClones,
    };
}
