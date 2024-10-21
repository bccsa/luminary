<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import { PencilIcon } from "@heroicons/vue/16/solid";
import { PublishStatus, type ContentDto } from "luminary-shared";
import { nextTick, ref, watch } from "vue";
import { Slug } from "@/util/slug";

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
        if (!titleChanged && !slugChanged) {
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
    { deep: true },
);

const validateSlug = async () => {
    if (!content.value) return;
    content.value.slug = await Slug.generate(content.value.slug, content.value._id || "");
};
</script>

<template>
    <div v-if="content">
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

        <!-- Summary -->
        <LInput
            name="summary"
            label="Summary"
            class="mt-4"
            :disabled="disabled"
            v-model="content.summary"
        />
    </div>
</template>
