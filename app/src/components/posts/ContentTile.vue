<script setup lang="ts">
import {
    db,
    DocType,
    TagType,
    type ContentDto,
    type PostDto,
    type TagDto,
    type Uuid,
} from "luminary-shared";
import { DateTime } from "luxon";
import { computed } from "vue";
import { useRouter } from "vue-router";

type Props = {
    parent: PostDto | TagDto;
    parentType: DocType.Post | DocType.Tag;
    languageId?: Uuid;
    tagType?: TagType;
    pinned?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    pinned: false,
});

const content = db.whereParentAsRef<ContentDto[]>(props.parent._id, props.parentType, []);

const router = useRouter();

const title = computed(() => {
    const preferred = content.value.filter((c) => c.language == props.languageId)[0]?.title;

    if (preferred) return preferred;

    if (content.value[0]) {
        return content.value[0].title;
    }

    return "No translations available";
});

const openPost = () => {
    router.push({ name: "post", params: { slug: content.value[0].slug } });
};
</script>

<template>
    <div
        @click="openPost"
        class="-m-2 cursor-pointer rounded-md p-2 hover:bg-zinc-50 active:bg-zinc-100 active:shadow-inner dark:hover:bg-zinc-500 dark:active:bg-zinc-400"
    >
        <img :src="parent.image" class="aspect-video rounded-lg object-cover shadow-md" />
        <h3 class="mt-2 text-sm text-zinc-800 dark:text-zinc-50">{{ title }}</h3>
        <div class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-200">
            {{ db.toDateTime(parent.updatedTimeUtc).toLocaleString(DateTime.DATETIME_MED) }}
        </div>
    </div>
</template>
