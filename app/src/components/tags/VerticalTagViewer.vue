<script setup lang="ts">
import { DocType, db, type TagDto, type QueryOptions as options } from "luminary-shared";
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import LImage from "../images/LImage.vue";

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
                <!-- add a transparent border if the content is not selected -->
                <!-- push tto the right -->
                <div
                    class="flex items-center border-l-4 border-transparent px-1 py-1 transition duration-200 hover:border-transparent hover:bg-yellow-100 dark:hover:bg-yellow-100/25"
                    :class="{
                        ' border-l-4 border-yellow-500 bg-yellow-100/50  dark:border-yellow-800 dark:bg-yellow-100/10':
                            isContentSelected(content.slug),
                    }"
                >
                    <div class="flex items-center">
                        <div class="relative overflow-hidden rounded">
                            <LImage
                                :image="content.parentImageData"
                                aspectRatio="video"
                                size="small"
                            />
                        </div>
                    </div>
                    <div class="ml-2 w-1/3">
                        <h1 class="text-sm">
                            {{ content.title }}
                        </h1>
                    </div>
                </div>
            </RouterLink>
        </div>
    </div>
</template>
