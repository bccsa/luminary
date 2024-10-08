<script setup lang="ts">
import { DocType, db, type ContentDto } from "luminary-shared";
import VideoPlayer from "@/components/content/VideoPlayer.vue";
import { computed, ref, watch } from "vue";
import LoadingSpinner from "@/components/LoadingSpinner.vue";
import { ArrowLeftIcon } from "@heroicons/vue/16/solid";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { DateTime } from "luxon";
import { useRouter } from "vue-router";
import { appLanguageAsRef, appName } from "@/globalConfig";
import { useNotificationStore } from "@/stores/notification";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import Link from "@tiptap/extension-link";
import LImage from "@/components/images/LImage.vue";

const router = useRouter();

type Props = {
    slug: string;
};
const props = defineProps<Props>();

const content = db.getBySlugAsRef<ContentDto>(props.slug);
const tagsContent = ref<ContentDto[]>([]);

const isExpiredOrScheduled = computed(() => {
    if (!content.value) return false;
    return (
        (content.value.publishDate && content.value.publishDate > Date.now()) ||
        (content.value.expiryDate && content.value.expiryDate < Date.now())
    );
});

watch(
    content,
    async () => {
        if (!content.value) {
            return;
        }

        document.title = isExpiredOrScheduled.value
            ? `Page not found - ${appName}`
            : `${content.value.title} - ${appName}`;

        if (isExpiredOrScheduled.value) return;

        tagsContent.value = await db.whereParent(
            content.value.parentTags,
            DocType.Tag,
            content.value.language,
        );
    },
    { immediate: true },
);

watch(
    appLanguageAsRef,
    async () => {
        if (!content.value) {
            return;
        }

        if (appLanguageAsRef.value?._id != content.value.language) {
            const contentDocs = await db.whereParent(content.value.parentId);
            const preferred = contentDocs.find((c) => c.language == appLanguageAsRef.value?._id);

            if (preferred) {
                content.value = preferred;
                await router.replace({ name: "content", params: { slug: preferred.slug } });
                return;
            }
            useNotificationStore().addNotification({
                title: "Translation not found",
                description: `There is no ${appLanguageAsRef.value?.name} translation for this content.`,
                state: "error",
                type: "toast",
            });
        }
    },
    { immediate: true },
);

const isLoading = computed(() => {
    return content.value == undefined;
});

const text = computed(() => {
    if (!content.value.text) {
        return "";
    }

    let text;

    // Only parse text with TipTap if it's JSON, otherwise we render it out as HTML
    try {
        text = JSON.parse(content.value.text);
    } catch {
        return content.value.text;
    }

    return generateHTML(text, [StarterKit, Link]);
});
</script>

<template>
    <div class="hidden lg:block">
        <RouterLink
            to="/"
            class="-mx-2 mb-1 inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200 dark:text-slate-100 dark:hover:bg-zinc-500 dark:hover:text-zinc-50 dark:active:bg-zinc-400"
        >
            <ArrowLeftIcon class="h-4 w-4" /> Back
        </RouterLink>
    </div>

    <div v-if="isLoading">
        <LoadingSpinner />
    </div>

    <NotFoundPage v-else-if="isExpiredOrScheduled" />

    <article v-else class="mx-auto mb-12 max-w-3xl">
        <VideoPlayer v-if="content.video" :content="content" />
        <LImage
            v-else-if="content.parentImageData"
            :image="content.parentImageData"
            aspectRatio="video"
            size="post"
        />

        <h1 class="text-bold mt-4 text-center text-2xl text-zinc-800 dark:text-slate-50">
            {{ content.title }}
        </h1>

        <div
            class="mt-1 text-center text-sm text-zinc-500 dark:text-slate-300"
            v-if="content.publishDate && content.parentPublishDateVisible"
        >
            {{
                content.publishDate
                    ? db.toDateTime(content.publishDate).toLocaleString(DateTime.DATETIME_MED)
                    : ""
            }}
        </div>

        <div class="mt-12 text-justify text-gray-800 dark:text-slate-100" v-if="content.summary">
            {{ content.summary }}
        </div>

        <div
            v-if="content.text"
            v-html="text"
            class="prose prose-zinc mt-6 max-w-3xl text-justify dark:prose-invert"
        ></div>

        <div
            class="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-500"
            v-if="content.parentTags.length > 0"
        >
            <h3 class="mb-2 text-sm text-zinc-600 dark:text-slate-200">Tags</h3>
            <div class="flex gap-3">
                <span
                    v-for="tag in tagsContent"
                    :key="tag._id"
                    class="inline-block rounded bg-yellow-300 px-1.5 py-1 text-sm text-yellow-950 shadow"
                >
                    {{ tag.title }}
                </span>
            </div>
        </div>
    </article>
</template>
