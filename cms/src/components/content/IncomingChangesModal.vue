<script setup lang="ts">
import LDialog from "@/components/common/LDialog.vue";
import { cmsLanguages } from "@/globalConfig";
import type { ContentDto, ContentParentDto, Uuid } from "luminary-shared";
import { computed } from "vue";
import * as _ from "lodash";

type Props = {
    existingParent?: ContentParentDto;
    editableParent?: ContentParentDto;
    existingContent?: ContentDto[];
    editableContent: ContentDto[];
    /** Filters to only the docs that changed on the server (parent + content), keyed by `_id`. */
    isIncomingChange: (id: Uuid) => boolean;
};
const props = defineProps<Props>();

const open = defineModel<boolean>("open");

const emit = defineEmits<{
    /** User chose the server version — the caller reloads to discard local edits. */
    accept: [];
    /** User chose to keep their edits — dismiss and continue. */
    dismiss: [];
}>();

// Meta fields never represent a meaningful user-visible change.
const META = ["_rev", "updatedTimeUtc", "updatedBy"];

/** Render a value for the diff list: primitives inline (strings capped), everything else "(changed)". */
function fmt(v: unknown): string {
    if (v === undefined || v === null || v === "") return "—";
    if (typeof v === "string") return v.length > 120 ? v.slice(0, 120) + "…" : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return "(changed)";
}

type Row = { field: string; server: string; mine: string };

/** Top-level keys where the server (`server`) and the user's copy (`mine`) disagree. */
function changedFields(server: Record<string, unknown>, mine: Record<string, unknown>): Row[] {
    const keys = new Set([...Object.keys(server ?? {}), ...Object.keys(mine ?? {})]);
    const rows: Row[] = [];
    for (const key of keys) {
        if (META.includes(key)) continue;
        if (_.isEqual(server?.[key], mine?.[key])) continue;
        rows.push({ field: key, server: fmt(server?.[key]), mine: fmt(mine?.[key]) });
    }
    return rows;
}

function languageName(languageId: Uuid): string {
    return cmsLanguages.value.find((l) => l._id === languageId)?.name ?? languageId;
}

type Section = { label: string; rows: Row[] };

const sections = computed<Section[]>(() => {
    const out: Section[] = [];

    const parent = props.editableParent;
    if (parent && props.existingParent && props.isIncomingChange(parent._id)) {
        const rows = changedFields(
            props.existingParent as unknown as Record<string, unknown>,
            parent as unknown as Record<string, unknown>,
        );
        if (rows.length) out.push({ label: "Settings", rows });
    }

    for (const content of props.editableContent) {
        if (!props.isIncomingChange(content._id)) continue;
        const server = props.existingContent?.find((c) => c._id === content._id);
        if (!server) continue;
        const rows = changedFields(
            server as unknown as Record<string, unknown>,
            content as unknown as Record<string, unknown>,
        );
        if (rows.length) out.push({ label: languageName(content.language), rows });
    }

    return out;
});
</script>

<template>
    <LDialog
        v-model:open="open"
        title="Changes from the remote"
        description="Someone else changed this document while you were editing. Review the differences below, then either load the remote version (discards your unsaved changes) or keep editing yours."
        primaryButtonText="Use remote version"
        secondaryButtonText="Keep my changes"
        context="danger"
        largeModal
        :primaryAction="() => emit('accept')"
        :secondaryAction="
            () => {
                emit('dismiss');
                open = false;
            }
        "
        data-test="incoming-changes-modal"
    >
        <div class="mt-3 flex flex-col gap-4">
            <p v-if="!sections.length" class="text-sm text-zinc-500">
                The remote version no longer differs from yours.
            </p>
            <div v-for="section in sections" :key="section.label" class="flex flex-col gap-1">
                <h3 class="text-sm font-semibold text-zinc-700">{{ section.label }}</h3>
                <div class="overflow-x-auto rounded-md border border-zinc-200">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-zinc-50 text-xs text-zinc-500">
                            <tr>
                                <th class="px-3 py-2 font-medium">Field</th>
                                <th class="px-3 py-2 font-medium">Remote</th>
                                <th class="px-3 py-2 font-medium">Yours</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="row in section.rows"
                                :key="row.field"
                                class="border-t border-zinc-100 align-top"
                            >
                                <td class="px-3 py-2 font-medium text-zinc-600">{{ row.field }}</td>
                                <td class="whitespace-pre-wrap break-words px-3 py-2 text-zinc-800">
                                    {{ row.server }}
                                </td>
                                <td class="whitespace-pre-wrap break-words px-3 py-2 text-zinc-800">
                                    {{ row.mine }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </LDialog>
</template>
