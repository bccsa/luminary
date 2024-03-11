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
import { ExclamationCircleIcon, XCircleIcon } from "@heroicons/vue/16/solid";
import { ContentStatus, type Content, type Post, type Tag, TagType } from "@/types";
import { toTypedSchema } from "@vee-validate/yup";
import { useForm } from "vee-validate";
import * as yup from "yup";
import { computed, onBeforeMount, ref, toRaw } from "vue";
import { onlyAllowedKeys } from "@/util/onlyAllowedKeys";
import { DateTime } from "luxon";
import { renderErrorMessage } from "@/util/renderErrorMessage";
import { useLocalChangeStore } from "@/stores/localChanges";
import { storeToRefs } from "pinia";
import { useSocketConnectionStore } from "@/stores/socketConnection";
import { Slug } from "@/util/slug";
import TagSelector from "./TagSelector.vue";
import { useTagStore } from "@/stores/tag";

type Props = {
    content: Content;
    post?: Post;
};

const props = defineProps<Props>();

const { isLocalChange } = useLocalChangeStore();
const { isConnected } = storeToRefs(useSocketConnectionStore());

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

const hasText = ref(props.content.text != undefined && props.content.text.trim() != "");
const hasAudio = ref(props.content.audio != undefined && props.content.audio.trim() != "");
const hasVideo = ref(props.content.video != undefined && props.content.video.trim() != "");

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
        text: yup.string().optional(),
        audio: yup.string().optional(),
        video: yup.string().optional(),
    }),
);

const { handleSubmit, values, setValues, errors } = useForm({
    validationSchema,
});

onBeforeMount(() => {
    if (props.post) {
        selectedTags.value = [...props.post.tags];
    }

    // Convert dates to format VeeValidate understands
    const filteredContent: any = { ...toRaw(props.content) };
    filteredContent.publishDate = props.content.publishDate?.toISO()?.split(".")[0];

    setValues({
        ...onlyAllowedKeys(filteredContent, Object.keys(values)),
        parent: onlyAllowedKeys(toRaw(props.post), Object.keys(values.parent as object)),
    });
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
        slug: await Slug.makeUnique(contentValues.slug!), // Ensure slug is still unique before saving
    };

    const post: Partial<Post> = {
        ...toRaw(props.post),
        image: validatedFormValues.parent?.image,
        tags: selectedTags.value,
    };

    isDirty.value = false;

    return emit("save", content, post);
};

const saveAndPublish = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Published);
});
const saveAsDraft = handleSubmit(async (validatedFormValues) => {
    return save(validatedFormValues, ContentStatus.Draft);
});

const canPublish = computed(() => {
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
        (values.text != undefined && values.text?.trim() != "") ||
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

const updateSlug = async (title: string) => {
    setValues({ slug: await Slug.generate(title) });
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
</script>

<template>
    <form
        type="post"
        class="relative grid grid-cols-3 gap-8"
        @submit.prevent
        @change="isDirty = true"
    >
        <div class="col-span-3 space-y-6 md:col-span-2">
            <LCard title="Basic translation settings" collapsible>
                <LInput
                    @change="(e) => updateSlug(e.target.value)"
                    name="title"
                    label="Title"
                    required
                />
                <div class="mt-2 flex gap-1 text-xs text-gray-800">
                    <span class="py-0.5">Slug:</span>
                    <span class="inline-block rounded bg-gray-200 px-1.5 py-0.5">{{
                        values.slug
                    }}</span>
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
                @click="hasText = true"
                v-if="!hasText"
                data-test="addText"
            >
                Add text
            </LButton>
            <LCard title="Text content" :icon="DocumentTextIcon" collapsible v-show="hasText">
                <LInput name="text" />
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
                        <div class="flex flex-col gap-4 text-sm text-gray-700">
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
                                <p class="mt-6 text-xs text-gray-700">
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
                                <p class="mt-6 text-xs text-gray-700">
                                    These fields prevent <strong>publishing</strong>:
                                </p>

                                <TransitionGroup
                                    class="mt-2 space-y-2 pt-2 text-sm text-gray-900"
                                    move-class="transition ease-out duration-300"
                                    enter-active-class="transition ease-out duration-300"
                                    enter-from-class="opacity-0 translate-x-8"
                                    leave-to-class="opacity-0 translate-x-8"
                                    leave-active-class="transition ease-out duration-300 absolute"
                                    tag="div"
                                >
                                    <div v-if="!hasOneContentField" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-gray-400" />
                                        </p>
                                        <p>
                                            At least one of text, audio or video content is required
                                        </p>
                                    </div>
                                    <div v-if="!hasSummary" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-gray-400" />
                                        </p>
                                        <p>Summary is required</p>
                                    </div>
                                    <div v-if="!hasPublishDate" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-gray-400" />
                                        </p>
                                        <p>Publish date is required</p>
                                    </div>
                                    <div v-if="!hasTag" class="flex gap-2">
                                        <p>
                                            <XCircleIcon class="mt-0.5 h-4 w-4 text-gray-400" />
                                        </p>
                                        <p>At least one tag is required</p>
                                    </div>
                                </TransitionGroup>
                            </div>
                        </Transition>
                    </template>
                </LCard>

                <LCard
                    title="Post settings"
                    :icon="Cog6ToothIcon"
                    class="sticky top-20"
                    collapsible
                >
                    <LInput
                        name="parent.image"
                        label="Default image"
                        placeholder="cdn.bcc.africa/img/image.png"
                        leftAddOn="https://"
                    >
                        This image can be overridden in a translation
                    </LInput>

                    <TagSelector
                        label="Categories"
                        class="mt-6"
                        :tags="availableCategories"
                        :selected-tags="selectedCategories"
                        :language="content.language"
                        @select="addTag"
                        @remove="removeTag"
                    />

                    <TagSelector
                        label="Topics"
                        class="mt-6"
                        :tags="availableTopics"
                        :selected-tags="selectedTopics"
                        :language="content.language"
                        @select="addTag"
                        @remove="removeTag"
                    />

                    <TagSelector
                        label="Audio playlists"
                        class="mt-6"
                        :tags="availableAudioPlaylists"
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
