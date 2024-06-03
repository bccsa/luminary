<script setup lang="ts">
import BasePage from "@/components/BasePage.vue";
import LButton from "@/components/button/LButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import { PlusIcon } from "@heroicons/vue/20/solid";
import { TagIcon } from "@heroicons/vue/24/solid";
import { RouterLink } from "vue-router";
import { AclPermission, DocType, TagType, type PostDto, type TagDto } from "@/types";
import { useUserAccessStore } from "@/stores/userAccess";
import { computed } from "vue";
import ContentTable2 from "@/components/content/ContentTable2.vue";
import { db } from "@/db/baseDatabase";

type Props = {
    docType: DocType.Post | DocType.Tag;
    tagType?: TagType;
    titleSingular: string;
    titlePlural: string;
};

const props = defineProps<Props>();

const contentParents = db.whereTypeAsRef<PostDto[] | TagDto[]>(props.docType, [], props.tagType);
const { hasAnyPermission } = useUserAccessStore();

const canCreateNew = computed(() => hasAnyPermission(props.docType, AclPermission.Create));
const createRouteParams = props.tagType ? { tagType: props.tagType } : undefined;
</script>

<template>
    <BasePage :title="titlePlural" :loading="contentParents === undefined">
        <template #actions>
            <LButton
                v-if="contentParents && contentParents.length > 0 && canCreateNew"
                variant="primary"
                :icon="PlusIcon"
                :is="RouterLink"
                :to="{ name: `${docType}s.create`, params: createRouteParams }"
            >
                Create {{ titleSingular }}
            </LButton>
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
            buttonText="Create"
            :buttonLink="{ name: `${docType}s.create`, params: createRouteParams }"
            :buttonPermission="canCreateNew"
        />

        <ContentTable2
            v-else
            :contentParents="contentParents"
            :docType="docType"
            :tagType="tagType"
            :editLinkName="`${docType}s.edit`"
        />
    </BasePage>
</template>
