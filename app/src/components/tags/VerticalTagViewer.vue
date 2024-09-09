<script setup lang="ts">
import { DocType, db, type TagDto, type queryOptions as options } from "luminary-shared";
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
            <div class="w-full">
                <RouterLink
                    v-for="content in taggedDocs"
                    :key="content._id"
                    :to="{
                        name: 'content',
                        params: { slug: content.slug },
                    }"
                >
                    <div
                        class="flex cursor-pointer gap-2 border-l-4 border-transparent bg-opacity-20 p-2 transition duration-200 hover:border-opacity-100 hover:bg-yellow-300 hover:bg-opacity-10"
                        :class="{
                            ' border-l-4 border-yellow-500 bg-yellow-300 bg-opacity-10':
                                isContentSelected(content.slug),
                        }"
                    >
                        <div class="w-1/3 lg:w-1/5">
                            <div>
                                <div class="relative overflow-hidden rounded-lg">
                                    <img
                                        class="w-full object-cover opacity-100"
                                        loading="lazy"
                                        draggable="false"
                                        :src="content.parentImage"
                                    />
                                </div>
                            </div>
                        </div>
                        <div class="ml-4 mt-1 w-2/3">
                            <h1 class="text-base">
                                {{ content.title }}
                            </h1>
                            <div class="mt-1 hidden opacity-70 lg:flex">
                                <div>
                                    <p>
                                        {{ content.summary }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </RouterLink>
            </div>
        </div>
    </div>
</template>
