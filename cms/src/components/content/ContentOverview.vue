<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import { DocumentIcon, PlusIcon } from "@heroicons/vue/20/solid";
import { TagIcon } from "@heroicons/vue/24/solid";
import { RouterLink } from "vue-router";
import {
    db,
    AclPermission,
    DocType,
    TagType,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
    hasAnyPermission,
} from "luminary-shared";
import { computed, ref, watch } from "vue";
import ContentTable2 from "@/components/content/ContentTable2.vue";
import LSelect from "../forms/LSelect.vue";
import { capitaliseFirstLetter } from "@/util/string";
import router from "@/router";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
};
const props = defineProps<Props>();

const tagType = Object.entries(TagType).some((t) => t[1] == props.tagType)
    ? props.tagType
    : undefined;

const contentParents = db.whereTypeAsRef<PostDto[] | TagDto[]>(props.docType, [], tagType);
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);
const selectedLanguage = ref<Uuid>("");
const languageOptions = computed(() =>
    languages.value.map((l) => ({ value: l._id, label: l.name })),
);

watch(
    languages,
    () => {
        if (languages.value.length > 0 && !selectedLanguage.value) {
            selectedLanguage.value = languages.value[0]._id;
        }
    },
    { once: true },
);

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Create));

// Set the title
let tagTypeString: string = tagType as string;
if (!Object.entries(TagType).some((t) => t[1] == tagTypeString)) tagTypeString = "";

const titleType = tagTypeString ? tagTypeString : props.docType;
router.currentRoute.value.meta.title = `${capitaliseFirstLetter(titleType)} overview`;
</script>

<template>
    <BasePage
        :title="`${capitaliseFirstLetter(titleType)} overview`"
        :loading="contentParents === undefined"
    >
        <template #actions>
            <div class="flex gap-4">
                <LSelect
                    v-model="selectedLanguage"
                    :options="languageOptions"
                    :required="true"
                    size="lg"
                />
                <LButton
                    v-if="contentParents && contentParents.length > 0 && canCreateNew"
                    variant="primary"
                    :icon="PlusIcon"
                    :is="RouterLink"
                    :to="{
                        name: `edit`,
                        params: {
                            docType: docType,
                            tagType: tagType ? tagType.toString() : 'default',
                            id: 'new',
                        },
                    }"
                    data-test="create-button"
                >
                    Create {{ docType }}
                </LButton>
            </div>
        </template>

        <EmptyState
            v-if="!contentParents || contentParents.length == 0"
            :icon="docType == DocType.Post ? DocumentIcon : TagIcon"
            :title="`No ${titleType}(s) yet`"
            :description="
                canCreateNew
                    ? `Get started by creating a new ${titleType}.`
                    : `You do not have permission to create a new ${titleType}.`
            "
            :buttonText="`Create ${titleType}`"
            :buttonLink="{
                name: `edit`,
                params: {
                    docType: docType,
                    tagType: tagType ? tagType.toString() : 'default',
                    id: 'new',
                },
            }"
            :buttonPermission="canCreateNew"
            data-test="no-content"
        />

        <ContentTable2
            v-else
            :contentParents="contentParents"
            :docType="docType"
            :tagType="tagType"
            :language="selectedLanguage"
        />
    </BasePage>
</template>
