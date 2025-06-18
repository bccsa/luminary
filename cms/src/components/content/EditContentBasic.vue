<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import { PencilIcon, ExclamationCircleIcon } from "@heroicons/vue/16/solid";
import {
    db,
    DocType,
    PublishStatus,
    type RedirectDto,
    useDexieLiveQuery,
    type ContentDto,
} from "luminary-shared";
import { nextTick, ref, watch } from "vue";
import { Slug } from "@/util/slug";
import LCard from "@/components/common/LCard.vue";
import LTabs from "@/components/common/LTabs.vue";

type Props = {
    disabled: boolean;
};
defineProps<Props>();
const content = defineModel<ContentDto>("content");

// Slug generation
const isEditingSlug = ref(false);
const slugInput = ref<HTMLInputElement | undefined>(undefined);

const startEditingSlug = () => {
    isEditingSlug.value = true;
    nextTick(() => {
        slugInput.value?.focus();
    });
};

let previousTitle: string = content.value?.title || "";
let previousSlug: string = content.value?.slug || "";
watch(
    content,
    async () => {
        if (!content.value) return;

        const titleChanged = previousTitle != content.value.title;
        const slugChanged = previousSlug != content.value.slug;

        // Only update the slug if the title or slug has changed
        if (
            !titleChanged &&
            !slugChanged &&
            ((content.value.title && content.value.slug) || !content.value.title)
        ) {
            return;
        }

        // If the title is empty, generate a new slug
        if (!content.value.title) {
            content.value.slug = "";
        }

        // If the slug is empty, generate a new one from the title
        if (!content.value.slug) {
            content.value.slug = Slug.generateNonUnique(content.value.title);
        }

        // Auto-update the slug if the title changes when in draft mode (unless the slug has been manually changed)
        if (
            titleChanged &&
            content.value.status == PublishStatus.Draft &&
            content.value.slug.replace(/-[0-9]*$/g, "") ==
                Slug.generateNonUnique(previousTitle).replace(/-[0-9]*$/g, "")
        ) {
            // TODO: This sometimes creates a race condition
            content.value.slug = Slug.generateNonUnique(content.value.title);
        }

        // Validate slug
        if (slugChanged) {
            content.value.slug = Slug.generateNonUnique(content.value.slug);
        }

        previousTitle = content.value.title;
        previousSlug = content.value.slug;
    },
    { deep: true, immediate: true },
);

const validateSlug = async () => {
    if (!content.value) return;
    content.value.slug = await Slug.generate(content.value.slug, content.value._id || "");
};

// Tabs for Title & Summary
const currentTab = ref("visible"); // Default tab key
const tabs = [
    { title: "Visible title & summary", key: "visible" },
    { title: "SEO title & summary", key: "seo" },
];

const existingRedirectForSlug = useDexieLiveQuery(
    () => {
        const slug = content.value?.slug;
        if (!slug) return Promise.resolve([]);

        return db.docs
            .where("type")
            .equals(DocType.Redirect)
            .and((doc: RedirectDto) => doc.slug === slug)
            .toArray();
    },
    { initialValue: [] },
);
</script>

<template>
    <div v-if="content">
        <LCard title="Title & Summary" collapsible>
            <!-- Tab Navigation using LTabs -->
            <LTabs :tabs="tabs" :currentTab="currentTab" @update:currentTab="currentTab = $event" />

            <!-- Tab Content -->
            <div class="py-4">
                <div v-if="currentTab === 'visible'">
                    <!-- Title -->
                    <LInput
                        name="title"
                        label="Title"
                        required
                        :disabled="disabled"
                        v-model="content.title"
                        @blur="validateSlug"
                    />

                    <!-- Slug -->
                    <div class="flex flex-col gap-1">
                        <div class="mt-2 flex gap-1 align-top text-xs text-zinc-800">
                            <span class="py-0.5">Slug:</span>
                            <span
                                v-show="!isEditingSlug"
                                data-test="slugSpan"
                                class="inline-block rounded-md bg-zinc-200 px-1.5 py-0.5"
                                >{{ content.slug }}</span
                            >
                            <LInput
                                v-show="isEditingSlug"
                                :disabled="disabled"
                                ref="slugInput"
                                name="slug"
                                size="sm"
                                class="w-full"
                                v-model="content.slug"
                                @blur="
                                    isEditingSlug = false;
                                    validateSlug();
                                "
                            />
                            <button
                                data-test="editSlugButton"
                                v-if="!isEditingSlug && !disabled"
                                @click="startEditingSlug"
                                class="flex h-5 w-5 min-w-5 items-center justify-center rounded-md py-0.5 hover:bg-zinc-200 active:bg-zinc-300"
                                title="Edit slug"
                            >
                                <component :is="PencilIcon" class="h-4 w-4 text-zinc-500" />
                            </button>
                        </div>
                        <span
                            v-if="existingRedirectForSlug.length > 0"
                            :title="`This slug redirects to '/${existingRedirectForSlug[0].toSlug}'`"
                            class="flex items-center gap-1 text-xs"
                        >
                            <ExclamationCircleIcon class="size-4 text-yellow-400" />
                            A redirect exists for this slug
                        </span>
                    </div>

                    <!-- Author -->
                    <LInput
                        name="author"
                        label="Author"
                        v-model="content.author"
                        placeholder="John Doe..."
                        :disabled="disabled"
                        class="mt-4"
                    />

                    <!-- Summary -->
                    <LInput
                        name="summary"
                        label="Summary"
                        class="mt-4"
                        :disabled="disabled"
                        v-model="content.summary"
                    />
                </div>

                <div v-else-if="currentTab === 'seo'">
                    <!-- Title SEO -->
                    <LInput
                        name="seo-title"
                        label="Title"
                        :disabled="disabled"
                        :placeholder="content.title"
                        v-model="content.seoTitle"
                    />

                    <!-- Summary SEO -->
                    <LInput
                        name="seo-summary"
                        label="Summary"
                        class="mt-4"
                        :disabled="disabled"
                        :placeholder="content.summary"
                        v-model="content.seoString"
                    />
                </div>
            </div>
        </LCard>
    </div>
</template>
