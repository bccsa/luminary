<script setup lang="ts">
import { DocType, db, type TagDto, type QueryOptions as options } from "luminary-shared";
import { ref, watch } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
type Props = {
    tag?: TagDto;
    title?: string;
    queryOptions: options;
    showPublishDate?: boolean;
};
const props = withDefaults(defineProps<Props>(), {
    showPublishDate: true,
});

const isContentSelected = (slug: string) => {
    if (router.currentRoute.value.params.slug === slug) return true;
    return false;
};

const taggedDocs = db.contentWhereTagAsRef(props.tag?._id, props.queryOptions);

const tagContent = props.tag
    ? db.whereParentAsRef(props.tag._id, DocType.Tag, props.queryOptions.languageId, [])
    : ref([]);

const tagTitle = ref(props.title);
const tagSummary = ref("");

watch(tagContent, () => {
    if (props.title) {
        tagTitle.value = props.title;
        return;
    }

    if (tagContent.value.length > 0) {
        tagTitle.value = tagContent.value[0].title;
        tagSummary.value = tagContent.value[0].summary || "";
        return;
    }

    tagTitle.value = "No translation found";
});
</script>

<template>
    <div>
        <div>
            <RouterLink
                v-for="content in taggedDocs"
                :key="content._id"
                :to="{
                    name: 'content',
                    params: { slug: content.slug },
                }"
            >
                <div
                    class="flex items-center justify-between border-l-4 border-transparent px-2 py-1 transition duration-200 hover:bg-yellow-100 dark:hover:text-slate-900"
                    :class="{
                        ' border-yellow-500 bg-yellow-50': isContentSelected(content.slug),
                    }"
                >
                    <div class="ml-2 w-2/3">
                        <h1
                            class="text-sm"
                            :class="{ 'text-black': isContentSelected(content.slug) }"
                        >
                            {{ content.title }}
                        </h1>
                    </div>
                    <div class="flex w-1/3 items-center justify-end lg:w-1/5">
                        <div class="relative overflow-hidden rounded">
                            <img
                                class="w-32 object-cover opacity-100"
                                loading="lazy"
                                draggable="false"
                                :src="content.parentImage"
                            />
                        </div>
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>
