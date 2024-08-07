<script setup lang="ts">
import {
    db,
    PublishStatus,
    DocType,
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
    AclPermission,
    verifyAccess,
} from "luminary-shared";
import { DateTime } from "luxon";
import { computed } from "vue";
import LBadge from "../common/LBadge.vue";
import { EyeIcon, PencilSquareIcon } from "@heroicons/vue/20/solid";
import { RouterLink } from "vue-router";
import LButton from "../button/LButton.vue";

type Props = {
    parent: PostDto | TagDto;
    parentType: DocType.Post | DocType.Tag;
    languageId: Uuid;
    languages: LanguageDto[];
};
const props = defineProps<Props>();
const content = db.whereParentAsRef(props.parent._id, props.parentType, undefined, []);
const isLocalChange = db.isLocalChangeAsRef(props.parent._id);

// Get the title in the selected language if available, otherwise use the first available translation
const title = computed(() => {
    const preferred = content.value.filter((c) => c.language == props.languageId)[0]?.title;

    if (preferred) return preferred;

    if (content.value[0]) {
        return content.value[0].title;
    }

    return "No translations available";
});

// Determine the status of the translation
const translationStatus = computed(() => {
    return (content: ContentDto[], language: LanguageDto) => {
        const item = content.find((c: ContentDto) => c.language == language._id);

        if (!item) {
            return "default";
        }

        if (item.status == PublishStatus.Published) {
            return "success";
        }

        if (item.status == PublishStatus.Draft) {
            return "info";
        }

        return "default";
    };
});
</script>

<template>
    <tr>
        <!-- title -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-6">
            {{ title }}
        </td>

        <!-- status -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            <LBadge v-if="isLocalChange" variant="warning"> Offline changes </LBadge>
        </td>
        <!-- translations -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-900 sm:pl-3">
            <div class="flex gap-2" v-if="content.length > 0">
                <RouterLink
                    custom
                    v-for="language in languages"
                    :key="language.languageCode"
                    v-slot="{ navigate }"
                    :to="{
                        name: 'edit',
                        params: {
                            docType: parentType,
                            tagType: parentType == DocType.Tag ? DocType.Tag : undefined,
                            id: parent._id,
                            languageCode: languages.find((l) => l._id == language._id)
                                ?.languageCode,
                        },
                    }"
                >
                    <LBadge
                        @click="translationStatus(content, language) == 'default' ? '' : navigate()"
                        type="language"
                        :variant="translationStatus(content, language)"
                        :class="{
                            'cursor-pointer hover:opacity-75':
                                translationStatus(content, language) !== 'default',
                        }"
                    >
                        {{ language.languageCode }}
                    </LBadge>
                </RouterLink>
            </div>
        </td>
        <!-- updated -->
        <td class="whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3">
            {{ db.toDateTime(parent.updatedTimeUtc).toLocaleString(DateTime.DATETIME_MED) }}
        </td>
        <!-- actions -->
        <td
            class="flex justify-end whitespace-nowrap py-2 pl-4 pr-3 text-sm font-medium text-zinc-700 sm:pl-3"
        >
            <LButton
                v-if="verifyAccess(parent.memberOf, parentType, AclPermission.View)"
                variant="tertiary"
                :icon="
                    verifyAccess(parent.memberOf, parentType, AclPermission.Edit)
                        ? PencilSquareIcon
                        : EyeIcon
                "
                :is="RouterLink"
                :to="{
                    name: 'edit',
                    params: {
                        docType: parentType,
                        tagType: parentType == DocType.Tag ? (parent as TagDto).tagType : undefined,
                        id: parent._id,
                        languageCode: languages.find((l) => l._id == languageId)?.languageCode,
                    },
                }"
                class="flex justify-end"
                data-test="edit-button"
            ></LButton>
        </td>
    </tr>
</template>
