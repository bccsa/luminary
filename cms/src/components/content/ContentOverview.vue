<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { TagIcon } from "@heroicons/vue/24/solid";
import { RouterLink } from "vue-router";
import {
    AclPermission,
    DocType,
    TagType,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
} from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { computed, ref, watch } from "vue";
import ContentTable2 from "@/components/content/ContentTable2.vue";
import { db } from "@/db/baseDatabase";
import LSelect from "../forms/LSelect.vue";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
    titleSingular: string;
    titlePlural: string;
};

const props = defineProps<Props>();

const contentParents = db.whereTypeAsRef<PostDto[] | TagDto[]>(props.docType, [], props.tagType);
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

const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Create));
const createRouteParams = props.tagType ? { tagType: props.tagType } : undefined;
</script>

<template>
    <BasePage :title="titlePlural" :loading="contentParents === undefined">
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
                    :to="{ name: `${docType}s.create`, params: createRouteParams }"
                    data-test="create-button"
                >
                    Create {{ titleSingular }}
                </LButton>
            </div>
        </template>

        <EmptyState
            v-if="!contentParents || contentParents.length == 0"
            :icon="TagIcon"
            :title="`No ${titleSingular}s yet`"
            :description="
                canCreateNew
                    ? `Get started by creating a new ${titleSingular}.`
                    : `You do not have permission to create new ${titlePlural}.`
            "
            :buttonText="`Create ${titleSingular.charAt(0).toUpperCase()}${titleSingular.slice(1)}`"
            :buttonLink="{ name: `${docType}s.create`, params: createRouteParams }"
            :buttonPermission="canCreateNew"
            data-test="no-content"
        />

        <ContentTable2
            v-else
            :contentParents="contentParents"
            :docType="docType"
            :tagType="tagType"
            :editLinkName="`${docType}s.edit`"
            :language="selectedLanguage"
        />
    </BasePage>
</template>
