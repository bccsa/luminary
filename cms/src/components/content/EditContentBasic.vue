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
import LTextToggle from "../forms/LTextToggle.vue";
import RichTextEditor from "../editor/RichTextEditor.vue";
import FormLabel from "../forms/FormLabel.vue";

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
const currentToogle = ref("visible"); // Default tab key

// A Dexie live query to check if a redirect exists for the current slug
// This is used to warn the user if they are editing a slug that already has a redirect
const existingRedirectForSlug = useDexieLiveQuery(
    () => {
        const slug = content.value?.slug;

        return db.docs
            .where("type")
            .equals(DocType.Redirect)
            .and((d) => {
                const doc = d as RedirectDto;
                return doc.slug === slug;
            })
            .toArray() as unknown as Promise<RedirectDto[]>;
    },
    { initialValue: [] },
);
</script>

<template>
    <div v-if="content">
        <LCard title="Content" collapsible>
            <!-- Tab Navigation using LTabs -->
            <template #actions>
                <LTextToggle
                    v-model="currentToogle"
                    leftLabel="Visible"
                    :leftValue="'visible'"
                    rightLabel="SEO"
                    :rightValue="'seo'"
                    :disabled="disabled"
                    @click.stop
                />
            </template>

            <!-- Tab Content -->
            <div class="">
                <div v-if="currentToogle === 'visible'">
                    <div class="mb-4 flex flex-col gap-2">
                        <!-- Title -->
                        <div class="flex items-center gap-2">
                            <FormLabel class="w-16">Title</FormLabel>
                            <LInput
                                name="title"
                                label=""
                                required
                                :disabled="disabled"
                                v-model="content.title"
                                @blur="validateSlug"
                                class="flex-1"
                            />
                        </div>

                        <!-- Slug -->
                        <div class="flex flex-col gap-1">
                            <div class="mt-0 flex gap-1 align-top text-xs text-zinc-800">
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
                        <div class="flex items-center gap-2">
                            <FormLabel class="w-16">Author</FormLabel>
                            <LInput
                                name="author"
                                v-model="content.author"
                                placeholder="John Doe..."
                                :disabled="disabled"
                                inlineLabel
                                class="flex-1"
                            />
                        </div>

                        <!-- Summary -->
                        <LInput
                            name="summary"
                            label="Summary"
                            :disabled="disabled"
                            inputType="textarea"
                            placeholder="A short summary of the content..."
                            v-model="content.summary"
                            class="min-h-10 flex-1"
                        />
                    </div>

                    <!-- Text -->
                    <RichTextEditor
                        v-model:text="content.text"
                        title="Text"
                        :disabled="disabled"
                        data-test="richTextEditor"
                    />
                </div>

                <div v-else-if="currentToogle === 'seo'">
                    <div class="flex flex-col gap-4">
                        <!-- Seo -->
                        <div class="flex items-center gap-2">
                            <FormLabel class="w-16">Title</FormLabel>
                            <LInput
                                name="seo-title"
                                :disabled="disabled"
                                :placeholder="content.title"
                                v-model="content.seoTitle"
                                class="flex-1"
                            />
                        </div>

                        <!-- Summary SEO -->
                        <div class="flex items-center gap-2">
                            <FormLabel class="w-16">Summary</FormLabel>
                            <LInput
                                name="seo-summary"
                                class="flex-1"
                                :disabled="disabled"
                                :placeholder="content.summary"
                                v-model="content.seoString"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </LCard>
    </div>
</template>
