import { computed } from "vue";
import { DocType, useSharedHybridQuery, type ContentDto, type Uuid } from "luminary-shared";
import { cmsLanguageIdAsRef } from "@/globalConfig";

export type TagOption = { id: Uuid; label: string };

/**
 * All topic tags (as `Content` docs, one per tag id, deduped and preferring the current CMS
 * language) for use in tag pickers — shared by the "starting interests" overview and its add
 * modal.
 */
export function useTopicTagOptions() {
    const tagContent = useSharedHybridQuery<ContentDto>(
        () => ({
            selector: {
                type: DocType.Content,
                parentType: DocType.Tag,
            },
            $limit: 1000,
        }),
        { live: true },
    );

    const tagOptions = computed<TagOption[]>(() => {
        const byParent = new Map<Uuid, ContentDto>();
        for (const doc of tagContent.value) {
            const current = byParent.get(doc.parentId);
            if (!current || doc.language === cmsLanguageIdAsRef.value) byParent.set(doc.parentId, doc);
        }
        return [...byParent.values()]
            .map((doc) => ({ id: doc.parentId, label: doc.title || doc.parentId }))
            .sort((a, b) => a.label.localeCompare(b.label));
    });

    function tagLabel(tagId: Uuid): string {
        return tagOptions.value.find((option) => option.id === tagId)?.label ?? tagId;
    }

    return { tagOptions, tagLabel };
}
