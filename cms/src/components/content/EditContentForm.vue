<script setup lang="ts">
import LInput from "@/components/forms/LInput.vue";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import LCard from "@/components/common/LCard.vue";
import {
    Cog6ToothIcon,
    DocumentTextIcon,
    VideoCameraIcon,
    MusicalNoteIcon,
} from "@heroicons/vue/20/solid";
import { ExclamationCircleIcon, PencilIcon, XCircleIcon } from "@heroicons/vue/16/solid";
import { ContentStatus, type Content, type Post, type Tag, TagType } from "@/types";
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { computed, nextTick, onBeforeMount, ref, toRaw } from "vue";
import { onlyAllowedKeys } from "@/util/onlyAllowedKeys";
import { DateTime } from "luxon";
import { renderErrorMessage } from "@/util/renderErrorMessage";
import { useLocalChangeStore } from "@/stores/localChanges";
import { storeToRefs } from "pinia";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { Slug } from "@/util/slug";
import TagSelector from "./TagSelector.vue";
import { useTagStore } from "@/stores/tag";
import { capitalizeFirstLetter } from "@/util/string";
import RichTextEditor from "@/components/content/RichTextEditor.vue";
import FormLabel from "@/components/forms/FormLabel.vue";
import LToggle from "@/components/forms/LToggle.vue";
import { useNotificationStore } from "@/stores/notification";

const EMPTY_TEXT = "<p></p>";

type Props = {
    content: Content;
    parent: Post | Tag;
    ruleset: "post" | "tag";
};

const props = defineProps<Props>();

const { isLocalChange } = useLocalChangeStore();
const { isConnected } = storeToRefs(useSocketConnectionStore());
const { addNotification } = useNotificationStore();
const emit = defineEmits(["save"]);

const {
    categories: availableCategories,
    topics: availableTopics,
    audioPlaylists: availableAudioPlaylists,
} = storeToRefs(useTagStore());

const selectedTags = ref<Tag[]>([]);
const selectedCategories = computed(() => {
    return selectedTags.value.filter((t) => t.tagType == TagType.Category);
});
const selectedTopics = computed(() => {
    return selectedTags.value.filter((t) => t.tagType == TagType.Topic);
});
const selectedAudioPlaylists = computed(() => {
    return selectedTags.value.filter((t) => t.tagType == TagType.AudioPlaylist);
});

const hasText = computed(() => text.value && text.value.trim() !== "");
const hasAudio = ref(props.content.audio != undefined && props.content.audio.trim() != "");
const hasVideo = ref(props.content.video != undefined && props.content.video.trim() != "");

const text = ref<string>();
// @ts-ignore Pinned property does not exist on Post, which is why we check if it exists
const pinned = ref(props.parent.pinned ?? false);

const validationSchema = toTypedSchema(
    yup.object({
        parent: yup.object({
            image: yup.string().required(),
        }),
        title: yup.string().required(),
        slug: yup.string().required(),
        summary: yup.string().optional(),
        publishDate: yup
            .date()
            .transform((value, _, context) => {
                // Check to see if the previous transform already parsed the date
                if (context.isType(value)) {
                    return value;
                }

                // Default validation failed, clear the field
                // This happens when the 'clear' button in the browser datepicker is used,
                // which sets the value to an empty string
                return undefined;
            })
            .optional(),
        audio: yup.string().optional(),
        video: yup.string().optional(),
    }),
);

const { handleSubmit, values, setValues, errors } = useForm({
    validationSchema,
});

onBeforeMount(() => {
    if (props.parent.tags) {
        selectedTags.value = [...props.parent.tags];
    }

    // Convert dates to format VeeValidate understands
    const filteredContent: any = { ...toRaw(props.content) };
    filteredContent.publishDate = props.content.publishDate?.toISO()?.split(".")[0];

    setValues({
        ...onlyAllowedKeys(filteredContent, Object.keys(values)),
        parent: onlyAllowedKeys(toRaw(props.parent), Object.keys(values.parent as object)),
    });

    text.value = filteredContent.text;
});

const save = async (validatedFormValues: typeof values, status: ContentStatus) => {
    // Make sure we don't accidentally add the 'parent' object to the content
    const contentValues = { ...validatedFormValues };
    delete contentValues["parent"];
    let publishDate;
    if (contentValues.publishDate) {
        publishDate = DateTime.fromJSDate(contentValues.publishDate);
    }

    const content: Content = {
        ...toRaw(props.content),
        ...contentValues,
        publishDate,
        status,
        text: text.value == EMPTY_TEXT ? undefined : text.value,
        slug: await Slug.makeUnique(contentValues.slug!, props.content._id), // Ensure slug is still unique before saving
    };

    const parent: Partial<Post | Tag> = {
        ...toRaw(props.parent),
        image: validatedFormValues.parent?.image,
        tags: toRaw(selectedTags.value),
        // @ts-ignore We're only setting pinned for tags
        pinned: props.ruleset == "tag" ? pinned.value : undefined,
    };

    isDirty.value = false;

    addNotification({
        title: `Post saved ${status == ContentStatus.Published ? "and published" : "as draft"}`,
        description: `All changes are saved ${
            isConnected.value
                ? "online"
                : "offline, and will be sent to the server when you go online"
        }.`,
        state: "success",
    });

    return emit("save", content, parent);
};

const validationErrorCallback = () => {
    addNotification({
        title: "Changes not saved",
        description: "There are validation errors that prevent saving.",
        state: "error",
    });
};

const saveAndPublish = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Published);
}, validationErrorCallback);
const saveAsDraft = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Draft);
}, validationErrorCallback);

const canPublish = computed(() => {
    if (props.ruleset == "tag") {
        return hasPublishDate.value && hasSummary.value && hasParentImage.value;
    }

    return (
        hasOneContentField.value &&
        hasPublishDate.value &&
        hasSummary.value &&
        hasParentImage.value &&
        hasTag.value
    );
});
const hasOneContentField = computed(() => {
    return (
        (text.value != undefined && text.value.trim() != "" && text.value != EMPTY_TEXT) ||
        (values.audio != undefined && values.audio?.trim() != "") ||
        (values.video != undefined && values.video?.trim() != "")
    );
});
const hasSummary = computed(() => {
    return values.summary != undefined && values.summary.trim() != "";
});
const hasPublishDate = computed(() => {
    // @ts-ignore The browser resets the date to empty string when clicking 'Clear'
    return values.publishDate != undefined && values.publishDate != "";
});
const hasParentImage = computed(() => {
    return values.parent?.image != undefined;
});
const hasTag = computed(() => {
    return selectedTags.value.length > 0;
});

const isDirty = ref(false);
const isEditingSlug = ref(false);
const slugInput = ref<HTMLInputElement | undefined>(undefined);

const updateSlug = async (text: string) => {
    if (!text.trim() && values.title) text = values.title;
    setValues({ slug: await Slug.generate(text.trim(), props.content._id) });
};

const previousTitle = ref(props.content.title);
const updateSlugFromTitle = async (title: string) => {
    // Only auto-update if in draft mode
    // Check if the slug is still the default value
    if (
        props.content.status == ContentStatus.Draft &&
        values.slug?.replace(/-[0-9]*$/g, "") == Slug.generateNonUnique(previousTitle.value)
    ) {
        await updateSlug(title.toString());
    }
    previousTitle.value = title;
};

const addTag = (tag: Tag) => {
    const existing = selectedTags.value.find((c) => c._id == tag._id);

    if (!existing) {
        selectedTags.value.push(tag);
    }
};

const removeTag = (tag: Tag) => {
    selectedTags.value = selectedTags.value.filter((t) => t._id != tag._id);
};

const startEditingSlug = () => {
    isEditingSlug.value = true;
    nextTick(() => {
        slugInput.value?.focus();
    });
};

const initializeText = () => {
    text.value = EMPTY_TEXT;
};
</script>

<template>
    <form
        type="post"
        class="relative grid grid-cols-3 gap-8"
        @submit.prevent
        @input="isDirty = true"
    >
        <div class="col-span-3 space-y-6 md:col-span-2">
            <LCard title="Basic translation settings" collapsible>
                <LInput
                    @input="(e) => updateSlugFromTitle(e.target.value)"
                    name="title"
                    label="Title"
                    required
                />
                <div class="mt-2 flex gap-1 align-top text-xs text-zinc-800">
                    <span class="py-0.5">Slug:</span>
                    <span
                        v-show="!isEditingSlug"
                        data-test="slugSpan"
                        class="inline-block rounded bg-zinc-200 px-1.5 py-0.5"
                        >{{ values.slug }}</span
                    >
                    <LInput
                        v-show="isEditingSlug"
                        ref="slugInput"
                        name="slug"
                        size="sm"
                        class="w-full"
                        @change="(e) => updateSlug(e.target.value)"
                        @blur="isEditingSlug = false"
                    />
                    <button
                        data-test="editSlugButton"
                        v-if="!isEditingSlug"
                        @click="startEditingSlug"
                        class="flex h-5 w-5 min-w-5 items-center justify-center rounded py-0.5 hover:bg-zinc-200"
                        title="Edit slug"
                    >
                        <component :is="PencilIcon" class="h-4 w-4 text-zinc-500" />
                    </button>
                </div>

                <LInput name="summary" label="Summary" class="mt-4" />

                <div class="mt-4 flex gap-4">
                    <LInput
                        name="publishDate"
                        label="Publish date"
                        class="w-1/2"
                        type="datetime-local"
                    >
                        Only used for display, does not automatically publish at this date
                    </LInput>
                </div>
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="DocumentTextIcon"
                @click="initializeText"
                v-if="!hasText"
                data-test="addText"
            >
                Add text
            </LButton>
            <LCard title="Text content" :icon="DocumentTextIcon" collapsible v-if="hasText">
                <RichTextEditor v-model="text" />
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="VideoCameraIcon"
                @click="hasVideo = true"
                v-if="!hasVideo"
                data-test="addVideo"
            >
                Add Video
            </LButton>
            <LCard title="Video" :icon="VideoCameraIcon" collapsible v-show="hasVideo">
                <LInput name="video" leftAddOn="https://" />
            </LCard>

            <LButton
                type="button"
                variant="tertiary"
                :icon="MusicalNoteIcon"
                @click="hasAudio = true"
                v-if="!hasAudio"
                data-test="addAudio"
            >
                Add Audio
            </LButton>
            <LCard title="Audio" :icon="MusicalNoteIcon" collapsible v-show="hasAudio">
                <LInput name="audio" leftAddOn="https://" />
            </LCard>
        </div>

        <div class="col-span-3 md:col-span-1">
            <div class="sticky top-20 space-y-6">
                <LCard>
                    <div class="flex gap-4">
                        <LButton type="button" @click="saveAsDraft" data-test="draft">
                            Save as draft
                        </LButton>
                        <LButton
                            type="button"
                            variant="primary"
                            @click="saveAndPublish"
                            :disabled="!canPublish"
                            data-test="publish"
                        >
                            Save & publish
                        </LButton>
                    </div>

                    <template #footer>
                        <div class="flex flex-col gap-4 text-sm text-zinc-700">
                            <div class="flex items-end justify-between">
                                <div>Status</div>
                                <div class="flex justify-end gap-2">
                                    <LBadge v-if="isDirty">Unsaved changes</LBadge>
                                    <LBadge
                                        v-else-if="isLocalChange(content._id) && !isConnected"
                                        variant="warning"
                                    >
                                        Offline changes
                                    </LBadge>

                                    <LBadge
                                        variant="success"
                                        v-if="content.status == ContentStatus.Published"
                                    >
                                        Published
                                    </LBadge>
                                    <LBadge variant="info" v-else>Draft</LBadge>
                                </div>
                            </div>
                        </div>

                        <Transition
                            enter-active-class="transition ease-out duration-300"
                            enter-from-class="opacity-0 -translate-y-8 scale-y-50"
                            leave-active-class="transition ease-out duration-300 absolute"
                            leave-to-class="opacity-0 -translate-y-8 scale-y-[.1]"
                        >
                            <div v-if="Object.keys(errors).length > 0">
                                <p class="mt-6 text-xs text-zinc-700">
                                    These errors prevent <strong>saving</strong>, even as draft:
                                </p>

                                <TransitionGroup
                                    class="mt-2 space-y-2 pt-2 text-sm text-red-600"
                                    move-class="transition ease-out duration-300"
                                    enter-active-class="transition ease-out duration-300"
                                    enter-from-class="opacity-0 translate-x-8"
                                    leave-to-class="opacity-0 translate-x-8"
                                    leave-active-class="transition ease-out duration-300 absolute"
                                    tag="div"
                                >
                                    <div
                                        v-for="(error, key) in errors"
                                        :key="key"
                                        class="flex gap-2"
                                    >
                                        <p>
                                            <ExclamationCircleIcon
                                                class="mt-0.5 h-4 w-4 text-red-400"
                                            />
                                        </p>
                                        <p>{{ renderErrorMessage(error) }}</p>
                                    </div>
                                </TransitionGroup>
                            </div>
                        </Transition>

                        <Transition
                            enter-active-class="transition ease-out duration-300"
                            enter-from-class="opacity-0 -translate-y-8 scale-y-50"
                            leave-active-class="transition ease-out duration-300 absolute"
                            leave-to-class="opacity-0 -translate-y-8 scale-y-[.1]"
                        >
                            <div v-if="!canPublish">
                                <p class="mt-6 text-xs text-zinc-700">
                                    These fields prevent <strong>publishing</strong>:
                                </p>

                                <TransitionGroup
                                    class="mt-2 space-y-2 pt-2 text-sm text-zinc-900"
                                    move-class="transition ease-out duration-300"
                                    enter-active-class="transition ease-out duration-300"
                                    enter-from-class="opacity-0 translate-x-8"
                                    leave-to-class="opacity-0 translate-x-8"
                                    leave-active-class="transition ease-out duration-300 absolute"
                                    tag="div"
                                >
                                    <div
                                        v-if="!hasOneContentField && ruleset == 'post'"
                                        class="flex gap-2"
                                    >
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-zinc-400" />
                                        </p>
                                        <p>
                                            At least one of text, audio or video content is required
                                        </p>
                                    </div>
                                    <div v-if="!hasSummary" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-zinc-400" />
                                        </p>
                                        <p>Summary is required</p>
                                    </div>
                                    <div v-if="!hasPublishDate" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-zinc-400" />
                                        </p>
                                        <p>Publish date is required</p>
                                    </div>
                                    <div v-if="!hasTag && ruleset == 'post'" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-zinc-400" />
                                        </p>
                                        <p>At least one tag is required</p>
                                    </div>
                                </TransitionGroup>
                            </div>
                        </Transition>
                    </template>
                </LCard>

                <LCard
                    :title="`${capitalizeFirstLetter(ruleset)} settings`"
                    :icon="Cog6ToothIcon"
                    class="sticky top-20"
                    collapsible
                >
                    <div v-if="ruleset == 'tag'" class="mb-6 flex items-center justify-between">
                        <FormLabel>Pinned</FormLabel>
                        <LToggle v-model="pinned" />
                    </div>

                    <LInput name="parent.image" label="Default image" leftAddOn="https://">
                        This image can be overridden in a translation
                    </LInput>

                    <TagSelector
                        label="Categories"
                        class="mt-6"
                        :tags="availableCategories.filter((t) => t._id != parent._id)"
                        :selected-tags="selectedCategories"
                        :language="content.language"
                        @select="addTag"
                        @remove="removeTag"
                    />

                    <TagSelector
                        label="Topics"
                        class="mt-6"
                        :tags="availableTopics.filter((t) => t._id != parent._id)"
                        :selected-tags="selectedTopics"
                        :language="content.language"
                        @select="addTag"
                        @remove="removeTag"
                    />

                    <TagSelector
                        label="Audio playlists"
                        class="mt-6"
                        :tags="availableAudioPlaylists.filter((t) => t._id != parent._id)"
                        :selected-tags="selectedAudioPlaylists"
                        :language="content.language"
                        @select="addTag"
                        @remove="removeTag"
                    />
                </LCard>
            </div>
        </div>
    </form>
</template>
./LTag.vue
